"""Single-user PIN login. PIN and signing secret live only in server env vars."""
import hashlib
import hmac
import os
import time

from . import db

MAX_FAILS = 5
LOCK_SECONDS = 15 * 60
SESSION_SECONDS = 7 * 24 * 3600
COOKIE = "session"


def _secret():
    return os.environ["SESSION_SECRET"].encode()


def make_token(now=None):
    exp = str(int(now or time.time()) + SESSION_SECONDS)
    sig = hmac.new(_secret(), exp.encode(), hashlib.sha256).hexdigest()
    return f"{exp}.{sig}"


def valid_token(token, now=None):
    try:
        exp, sig = token.split(".", 1)
        good = hmac.new(_secret(), exp.encode(), hashlib.sha256).hexdigest()
        return hmac.compare_digest(sig, good) and int(exp) > (now or time.time())
    except Exception:
        return False


def attempt_login(pin, now=None):
    """Returns ('ok'|'bad'|'locked', seconds_locked). Failure state is kept in the DB
    because serverless instances share no memory."""
    now = int(now or time.time())
    try:
        fails, locked_until = db.query("SELECT fails, locked_until FROM login_state WHERE id = 1")[0]
    except (RuntimeError, IndexError):  # first run: schema not created yet
        db.init_schema()
        fails, locked_until = db.query("SELECT fails, locked_until FROM login_state WHERE id = 1")[0]
    if locked_until > now:
        return "locked", locked_until - now
    if hmac.compare_digest(pin.encode(), os.environ["APP_PIN"].encode()):
        db.query("UPDATE login_state SET fails = 0, locked_until = 0 WHERE id = 1")
        return "ok", 0
    fails += 1
    if fails >= MAX_FAILS:
        db.query("UPDATE login_state SET fails = 0, locked_until = ? WHERE id = 1", [now + LOCK_SECONDS])
        return "locked", LOCK_SECONDS
    db.query("UPDATE login_state SET fails = ? WHERE id = 1", [fails])
    return "bad", 0
