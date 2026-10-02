"""CSV import: parse + validate (preview), then save only after the user confirms (commit)."""
import csv
import io
from concurrent.futures import ThreadPoolExecutor
from datetime import date as date_cls, datetime, timezone

from . import db
from . import quotes as yq
from .service import SYMBOL_RE

COLUMNS = ["symbol", "action", "date", "quantity", "price", "gross", "fees", "tax", "fx_rate"]
NUMERIC = ["quantity", "price", "gross", "fees", "tax", "fx_rate"]
REQUIRED = {"buy": ["date", "quantity", "price"], "sell": ["date", "quantity", "gross", "fees", "tax"], "watch": []}
MAX_ROWS = 500


def _parse(text):
    reader = csv.DictReader(io.StringIO(text.lstrip("﻿")))
    if not reader.fieldnames or "symbol" not in [f.strip().lower() for f in reader.fieldnames]:
        raise ValueError("חסרה שורת כותרת עם העמודה symbol")
    rows = []
    for i, raw in enumerate(reader, start=2):
        r = {k.strip().lower(): (v or "").strip() for k, v in raw.items() if k}
        if not any(r.values()):
            continue
        row = {"line": i, "error": None, **{c: r.get(c, "") or None for c in COLUMNS}}
        row["symbol"] = (r.get("symbol") or "").upper()
        row["action"] = (r.get("action") or "").lower()
        rows.append(row)
        if len(rows) > MAX_ROWS:
            raise ValueError(f"יותר מ-{MAX_ROWS} שורות")
    return rows


def _validate_fields(row):
    if not SYMBOL_RE.match(row["symbol"]):
        return "סימול לא תקין"
    action = row["action"]
    if action not in REQUIRED:
        return "action חייב להיות buy, sell או watch"
    for f in REQUIRED[action]:
        if row[f] is None:
            return f"שדה חסר: {f}"
    for f in NUMERIC:
        if row[f] is not None:
            try:
                row[f] = float(row[f])
            except ValueError:
                return f"{f} אינו מספר"
            if row[f] < 0 or (f in ("quantity", "price") and row[f] == 0):
                return f"ערך לא תקין ב-{f}"
    if row["date"] is not None:
        try:
            if date_cls.fromisoformat(row["date"]) > datetime.now(timezone.utc).date():
                return "תאריך עתידי"
        except ValueError:
            return "תאריך לא תקין (נדרש YYYY-MM-DD)"
    return None


def validate(text):
    """Returns (rows, quotes_for_new_symbols). Row 'error' is None when the row is valid."""
    rows = _parse(text)
    known = {r[0]: r[1] for r in db.query("SELECT symbol, currency FROM stocks")}
    for row in rows:
        row["error"] = _validate_fields(row)
    new = sorted({r["symbol"] for r in rows if not r["error"] and r["symbol"] not in known})
    quotes = yq.fetch_quotes(new) if new else {}  # one bulk call for every new symbol
    existing = {(s, d, q, p) for s, d, q, p in db.query(
        "SELECT symbol, date, quantity, price FROM transactions WHERE type = 'buy'")}
    held = set(known)
    left = {}  # remaining quantity per symbol, updated in file order
    for sym, typ, q in db.query("SELECT symbol, type, quantity FROM transactions"):
        left[sym] = left.get(sym, 0) + (q if typ == "buy" else -q)
    seen = set()
    for row in rows:
        if row["error"]:
            continue
        sym = row["symbol"]
        if sym in quotes:
            q = quotes[sym]
            if "error" in q:
                row["error"] = "הסימול לא נמצא ב-Yahoo"
            elif q["currency"] not in ("ILS", "USD"):
                row["error"] = f"מטבע לא נתמך: {q['currency']}"
        if row["error"]:
            continue
        if row["action"] == "buy":
            key = (sym, row["date"], row["quantity"], row["price"])
            if key in existing or key in seen:
                row["error"] = "רכישה זהה כבר קיימת"
            seen.add(key)
            held.add(sym)
            left[sym] = left.get(sym, 0) + row["quantity"]
        elif row["action"] == "sell":
            if sym not in held:
                row["error"] = "מכירה של מניה שלא נרכשה"
            elif row["quantity"] > left.get(sym, 0) + 1e-9:
                row["error"] = f"אפשר למכור עד {left.get(sym, 0):g} יחידות"
            else:
                left[sym] -= row["quantity"]
    return rows, quotes


def preview(text):
    rows, _ = validate(text)
    bad = sum(1 for r in rows if r["error"])
    return {"rows": rows, "ok": len(rows) - bad, "errors": bad}


def commit(text, now=None):
    now = now or datetime.now(timezone.utc)
    rows, quotes = validate(text)
    if not rows:
        raise ValueError("הקובץ ריק")
    if any(r["error"] for r in rows):
        raise ValueError("יש שורות שגויות. תקן את הקובץ ונסה שוב")
    names = {}
    if quotes:  # names/exchanges are only needed for new stocks; fetched in parallel
        with ThreadPoolExecutor(max_workers=8) as ex:
            names = dict(zip(quotes, ex.map(yq.describe, quotes)))
    fx_cache = {}
    stmts = [("BEGIN", [])]
    for sym, q in quotes.items():
        d = names[sym]
        stmts.append(("INSERT INTO stocks (symbol, name, list, currency, exchange, added_at) VALUES (?, ?, 'watch', ?, ?, ?)",
                      [sym, d["name"], q["currency"], d["exchange"], now.isoformat()]))
        stmts.append(("INSERT OR REPLACE INTO quotes (symbol, price, day_open, quote_time, fetched_at) VALUES (?, ?, ?, ?, ?)",
                      [sym, q["price"], q["day_open"], q["quote_time_utc"], now.isoformat()]))
    currency = {r[0]: r[1] for r in db.query("SELECT symbol, currency FROM stocks")}
    currency.update({s: q["currency"] for s, q in quotes.items()})
    for row in rows:
        sym = row["symbol"]
        if row["action"] == "watch":
            continue
        fx = row["fx_rate"]
        if currency[sym] == "USD" and fx is None:
            if row["date"] not in fx_cache:
                fx_cache[row["date"]] = yq.fx_on(row["date"])
            fx = fx_cache[row["date"]]
        stmts.append(("INSERT INTO transactions (symbol, type, date, quantity, price, gross, fees, tax, fx_rate) "
                      "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                      [sym, row["action"], row["date"], row["quantity"], row["price"], row["gross"], row["fees"], row["tax"],
                       fx if currency[sym] == "USD" else None]))
        if row["action"] == "buy":
            stmts.append(("UPDATE stocks SET list = 'buy' WHERE symbol = ?", [sym]))
    stmts.append(("COMMIT", []))
    db.run(stmts)
    return {"imported": len(rows)}
