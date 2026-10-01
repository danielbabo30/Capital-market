"""Minimal Turso client over its HTTP pipeline API (no native deps, works on Vercel)."""
import os

import httpx

SCHEMA = [
    """CREATE TABLE IF NOT EXISTS stocks (
        symbol TEXT PRIMARY KEY, name TEXT, list TEXT NOT NULL CHECK (list IN ('buy','watch')),
        currency TEXT NOT NULL CHECK (currency IN ('ILS','USD')), exchange TEXT, added_at TEXT NOT NULL)""",
    """CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT, symbol TEXT NOT NULL, type TEXT NOT NULL CHECK (type IN ('buy','sell')),
        date TEXT NOT NULL, quantity REAL NOT NULL, price REAL, gross REAL, fees REAL, tax REAL, fx_rate REAL)""",
    """CREATE TABLE IF NOT EXISTS quotes (
        symbol TEXT PRIMARY KEY, price REAL, day_open REAL, quote_time TEXT, fetched_at TEXT)""",
    """CREATE TABLE IF NOT EXISTS daily_bars (
        symbol TEXT NOT NULL, date TEXT NOT NULL, open REAL, close REAL, PRIMARY KEY (symbol, date))""",
    """CREATE TABLE IF NOT EXISTS login_state (
        id INTEGER PRIMARY KEY CHECK (id = 1), fails INTEGER NOT NULL DEFAULT 0, locked_until INTEGER NOT NULL DEFAULT 0)""",
    "INSERT OR IGNORE INTO login_state (id) VALUES (1)",
]


def _endpoint():
    url = os.environ["TURSO_DATABASE_URL"].replace("libsql://", "https://", 1).rstrip("/")
    return url + "/v2/pipeline"


def _arg(v):
    if v is None:
        return {"type": "null"}
    if isinstance(v, bool):
        return {"type": "integer", "value": str(int(v))}
    if isinstance(v, int):
        return {"type": "integer", "value": str(v)}
    if isinstance(v, float):
        return {"type": "float", "value": v}
    return {"type": "text", "value": str(v)}


def _val(c):
    t = c["type"]
    if t == "null":
        return None
    if t == "integer":
        return int(c["value"])
    if t == "float":
        return float(c["value"])
    return c["value"]


def run(statements):
    """statements: list of (sql, args). Executed in order in one request; returns rows per statement."""
    reqs = [{"type": "execute", "stmt": {"sql": s, "args": [_arg(a) for a in args]}} for s, args in statements]
    reqs.append({"type": "close"})
    r = httpx.post(
        _endpoint(), json={"requests": reqs}, timeout=15,
        headers={"Authorization": "Bearer " + os.environ["TURSO_AUTH_TOKEN"]},
    )
    r.raise_for_status()
    out = []
    for res in r.json()["results"][:-1]:
        if res["type"] == "error":
            raise RuntimeError(res["error"]["message"])
        out.append([[_val(c) for c in row] for row in res["response"]["result"]["rows"]])
    return out


def query(sql, args=()):
    return run([(sql, list(args))])[0]


def init_schema():
    run([(s, []) for s in SCHEMA])
