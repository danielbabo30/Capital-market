import re
from datetime import date as date_cls, datetime, timezone

from . import calc, db, markets, periods
from . import quotes as yq

SYMBOL_RE = re.compile(r"^[A-Z0-9.\-=^]{1,15}$")


def _now():
    return datetime.now(timezone.utc)


def _dt(s):
    return datetime.fromisoformat(s) if s else None


def refresh(now=None):
    """Pull from Yahoo only the symbols that need it, in one bulk call, and cache the result.
    A failed pull never deletes old data; it only flags the symbol as not updated."""
    now = now or _now()
    db.init_schema()
    symbols = {r[0] for r in db.query("SELECT symbol FROM stocks WHERE symbol NOT IN (SELECT symbol FROM manual_prices)")}
    if db.query("SELECT 1 FROM stocks WHERE currency = 'USD' LIMIT 1"):
        symbols.add("ILS=X")
    fetched = {r[0]: _dt(r[1]) for r in db.query("SELECT symbol, fetched_at FROM quotes")}
    with_bars = {r[0] for r in db.query("SELECT DISTINCT symbol FROM daily_bars")}
    due = sorted(s for s in symbols
                 if markets.needs_refresh(markets.market_of(s), fetched.get(s), now)
                 or (s != "ILS=X" and s not in with_bars))
    if not due:
        return {"pulled": [], "failed": []}
    try:
        data = yq.fetch_quotes(due)
    except Exception:
        data = {s: {"error": "fetch failed"} for s in due}
    stmts, pulled, failed = [], [], []
    for sym in due:
        q = data.get(sym, {"error": "missing"})
        if "error" in q:
            failed.append(sym)
            stmts.append(("INSERT OR REPLACE INTO quote_status (symbol, failed) VALUES (?, 1)", [sym]))
        else:
            pulled.append(sym)
            stmts.append(("INSERT OR REPLACE INTO quotes (symbol, price, day_open, quote_time, fetched_at) "
                          "VALUES (?, ?, ?, ?, ?)", [sym, q["price"], q["day_open"], q["quote_time_utc"], now.isoformat()]))
            stmts.append(("INSERT OR REPLACE INTO quote_status (symbol, failed) VALUES (?, 0)", [sym]))
    stock_syms = [s for s in pulled if s != "ILS=X"]
    if stock_syms:  # daily history for the period bases: one more bulk call
        try:
            ila = {s for s in stock_syms if data[s].get("ila")}
            for sym, rows in yq.fetch_bars(stock_syms, ila).items():
                stmts += [("INSERT OR REPLACE INTO daily_bars (symbol, date, open, close) VALUES (?, ?, ?, ?)",
                           [sym, d, o, c]) for d, o, c in rows]
        except Exception:
            pass  # old bars stay; quotes are still saved
    db.run(stmts)
    return {"pulled": pulled, "failed": failed}


def add_stock(symbol, lst, date=None, price=None, quantity=None, fx_rate=None, now=None):
    now = now or _now()
    symbol = (symbol or "").strip().upper()
    if not SYMBOL_RE.match(symbol):
        raise ValueError("סימול לא תקין")
    if lst not in ("buy", "watch"):
        raise ValueError("רשימה לא תקינה")
    rows = db.query("SELECT currency FROM stocks WHERE symbol = ?", [symbol])
    if lst == "watch" and rows:
        raise ValueError("המניה כבר קיימת")
    if lst == "buy":
        try:
            if date_cls.fromisoformat(date) > now.date():
                raise ValueError("תאריך עתידי")
        except (TypeError, ValueError):
            raise ValueError("תאריך לא תקין")
        if not (quantity and quantity > 0 and price and price > 0):
            raise ValueError("כמות ושער חייבים להיות חיוביים")
    if rows:
        currency = rows[0][0]
    else:
        q = yq.fetch_quotes([symbol])[symbol]
        if "error" in q:
            raise LookupError("הסימול לא נמצא ב-Yahoo")
        currency = q["currency"]
        if currency not in ("ILS", "USD"):
            raise ValueError(f"מטבע לא נתמך: {currency}")
        d = yq.describe(symbol)
        db.run([
            ("INSERT INTO stocks (symbol, name, list, currency, exchange, added_at) VALUES (?, ?, 'watch', ?, ?, ?)",
             [symbol, d["name"], currency, d["exchange"], now.isoformat()]),
            ("INSERT OR REPLACE INTO quotes (symbol, price, day_open, quote_time, fetched_at) VALUES (?, ?, ?, ?, ?)",
             [symbol, q["price"], q["day_open"], q["quote_time_utc"], now.isoformat()]),
        ])
    if lst == "buy":
        fx = None
        if currency == "USD":
            fx = fx_rate or yq.fx_on(date)  # empty -> by purchase date
        db.run([
            ("INSERT INTO transactions (symbol, type, date, quantity, price, fx_rate) VALUES (?, 'buy', ?, ?, ?, ?)",
             [symbol, date, quantity, price, fx]),
            ("UPDATE stocks SET list = 'buy' WHERE symbol = ?", [symbol]),
        ])
    return {"symbol": symbol}


def delete_stock(symbol):
    db.run([(f"DELETE FROM {t} WHERE symbol = ?", [symbol])
            for t in ("transactions", "quotes", "quote_status", "daily_bars", "manual_prices", "stock_logos", "stocks")])


def delete_transaction(tx_id):
    rows = db.query("SELECT symbol, type, quantity FROM transactions WHERE id = ?", [tx_id])
    if not rows:
        raise LookupError("not found")
    sym, typ, qty = rows[0]
    if typ == "buy":
        buys, sold = _held(sym)
        if sum(b["quantity"] for b in buys) - qty < sold - 1e-9:
            raise ValueError("יש מכירות שתלויות ברכישה הזו. מחק קודם את המכירות")
    db.query("DELETE FROM transactions WHERE id = ?", [tx_id])
    if typ == "buy" and not db.query("SELECT 1 FROM transactions WHERE symbol = ? AND type = 'buy' LIMIT 1", [sym]):
        db.query("UPDATE stocks SET list = 'watch' WHERE symbol = ?", [sym])


def _money(x):
    return None if x is None else round(x, 2)


def _pct(x):
    return None if x is None else round(x * 100, 2)


def _manual_prices():
    try:
        rows = db.query("SELECT symbol, price, updated_at FROM manual_prices")
    except RuntimeError:  # table not created yet on an older database
        db.init_schema()
        rows = []
    return {r[0]: (r[1], _dt(r[2])) for r in rows}


def _logos():
    try:
        return {r[0]: r[1] for r in db.query("SELECT symbol, data FROM stock_logos")}
    except RuntimeError:  # table not created yet on an older database
        db.init_schema()
        return {}


MAX_LOGO = 60_000  # characters of data URL; the browser shrinks images to ~96px before sending


def set_logo(symbol, data):
    if not db.query("SELECT 1 FROM stocks WHERE symbol = ?", [symbol]):
        raise LookupError("המניה לא נמצאה")
    if not (isinstance(data, str) and data.startswith(("data:image/png;base64,", "data:image/jpeg;base64,", "data:image/webp;base64,"))):
        raise ValueError("קובץ תמונה לא תקין")
    if len(data) > MAX_LOGO:
        raise ValueError("התמונה גדולה מדי")
    _logos()  # make sure the table exists
    db.query("INSERT OR REPLACE INTO stock_logos (symbol, data) VALUES (?, ?)", [symbol, data])


def delete_logo(symbol):
    _logos()
    db.query("DELETE FROM stock_logos WHERE symbol = ?", [symbol])


def portfolio():
    logos = _logos()
    manual = _manual_prices()
    stocks = db.query("SELECT symbol, name, list, currency, exchange FROM stocks ORDER BY added_at")
    txs = db.query("SELECT id, symbol, type, date, quantity, price, gross, fees, tax, fx_rate "
                   "FROM transactions ORDER BY date, id")
    quotes = {r[0]: r for r in db.query("SELECT symbol, price, day_open, quote_time, fetched_at FROM quotes")}
    failed = {r[0] for r in db.query("SELECT symbol FROM quote_status WHERE failed = 1")}
    fx_now = quotes["ILS=X"][1] if "ILS=X" in quotes else None
    bars = {}
    for sym, d, o, c in db.query("SELECT symbol, date, open, close FROM daily_bars ORDER BY date"):
        bars.setdefault(sym, []).append((d, o, c))
    now = _now()
    port_pl = {p: 0.0 for p in periods.PERIODS}
    port_base = {p: 0.0 for p in periods.PERIODS}

    buys, sold, tx_list = {}, {}, {}
    for id_, sym, typ, date, qty, price, _g, _f, _t, fx in txs:
        if typ == "buy":
            buys.setdefault(sym, []).append({"quantity": qty, "price": price, "fx_rate": fx})
            tx_list.setdefault(sym, []).append({"id": id_, "date": date, "quantity": qty, "price": price, "fx_rate": fx})
        else:
            sold[sym] = sold.get(sym, 0) + qty

    buy_rows, watch_rows, positions, as_of = [], [], [], {}
    for sym, name, lst, currency, exch in stocks:
        q = quotes.get(sym)
        price = q[1] if q else None
        label = qt = None
        if sym in manual:
            price, upd = manual[sym]
            il = upd.astimezone(markets.TZ["TLV"])
            label = f"מחיר ידני, עודכן {il.day}.{il.month}"
        elif q:
            qt, ft = _dt(q[3]), _dt(q[4])
            label = markets.as_of_label(qt, ft)
            m = markets.market_of(sym)
            if m not in as_of or qt > as_of[m][0]:
                as_of[m] = (qt, label)
        row = {
            "symbol": sym, "name": name, "currency": currency, "price": price,
            "as_of": label, "stale": False if sym in manual else (sym in failed or q is None),
            "manual": sym in manual, "logo": logos.get(sym),
            "google_url": None if sym in manual else (f"https://www.google.com/finance/quote/{sym.split('.')[0]}:{exch}" if exch else None),
            "yahoo_url": None if sym in manual else f"https://finance.yahoo.com/quote/{sym}",
        }
        m = markets.market_of(sym)
        today = now.astimezone(markets.TZ[m]).date()
        quote_open = q[2] if q and qt and qt.astimezone(markets.TZ[m]).date() == today else None
        pb = periods.bases(bars.get(sym, []), today, quote_open)
        if sym in manual:  # no opening prices exist for a hand-priced holding
            pb = {p: (v[0], None, "no_data", None) for p, v in pb.items()}
        if lst == "watch":
            row["periods"] = {
                p: {"status": st,
                    "pct": _pct(((end if end is not None else price) - base) / base)
                           if st == "ok" and (end is not None or price is not None) else None}
                for p, (_s, base, st, end) in pb.items()
            }
            watch_rows.append(row)
            continue
        pos = calc.position(buys.get(sym, []), sold.get(sym, 0), price, fx_now, currency)
        positions.append(pos)
        row["periods"] = {}
        bought = sum(b["quantity"] for b in buys.get(sym, []))
        for p, (start, base, st, end) in pb.items():
            res = None
            if st == "ok" and price is not None and bought > 0 and pos["qty"] > 0:
                res = calc.period_position(tx_list[sym], pos["qty"] / bought, price if end is None else end,
                                           fx_now, currency, base, start, start if p == "yesterday" else None)
            if res:
                port_pl[p] += res["pl"]
                port_base[p] += res["base"]
            row["periods"][p] = {"status": st if res or st != "ok" else "no_data",
                                 "pl_ils": _money(res and res["pl"]), "pct": _pct(res and res["pct"])}
        row.update(
            qty=pos["qty"], avg_price=None if pos["avg_price"] is None else round(pos["avg_price"], 4),
            value_ils=_money(pos.get("value")), cost_ils=_money(pos.get("cost")),
            pl_ils=_money(pos.get("pl")), pl_pct=_pct(pos.get("pct")),
            stock_pl_ils=_money(pos.get("stock_pl")), fx_pl_ils=_money(pos.get("fx_pl")),
            transactions=tx_list.get(sym, []),
        )
        if pos["qty"] > 0:  # fully sold positions live on the sales screen only
            buy_rows.append(row)

    s = calc.summarize(positions)
    sold_rows = _sale_rows()
    realized_before = sum(r["before"] for r in sold_rows)
    realized_after = sum(r["after"] for r in sold_rows)
    return {
        "realized": {"before_tax": _money(realized_before), "after_tax": _money(realized_after)},
        "summary": {"value_ils": _money(s["value"]), "cost_ils": _money(s["cost"]),
                    "pl_ils": _money(s["pl"]), "pl_pct": _pct(s["pct"])},
        "periods": {p: {"status": "ok" if port_base[p] else "none", "pl_ils": _money(port_pl[p]),
                        "pct": _pct(port_pl[p] / port_base[p]) if port_base[p] else None}
                    for p in periods.PERIODS},
        "as_of": {m: v[1] for m, v in as_of.items()},
        "buy": buy_rows, "watch": watch_rows,
    }


def _held(symbol):
    """(buy rows, sold qty) for a symbol."""
    rows = db.query("SELECT type, quantity, price, fx_rate FROM transactions WHERE symbol = ?", [symbol])
    buys = [{"quantity": q, "price": p, "fx_rate": fx} for t, q, p, fx in rows if t == "buy"]
    return buys, sum(q for t, q, _p, _f in rows if t == "sell")


def add_sale(symbol, date, quantity, gross, fees, tax, now=None):
    now = now or _now()
    symbol = (symbol or "").strip().upper()
    try:
        if date_cls.fromisoformat(date) > now.date():
            raise ValueError("תאריך עתידי")
    except (TypeError, ValueError):
        raise ValueError("תאריך לא תקין")
    if not (quantity and quantity > 0):
        raise ValueError("כמות חייבת להיות חיובית")
    if gross is None or gross <= 0 or fees is None or fees < 0 or tax is None or tax < 0:
        raise ValueError("תמורה חייבת להיות חיובית, ועמלות ומס אינם יכולים להיות שליליים")
    buys, sold = _held(symbol)
    if not buys:
        raise LookupError("אין רכישות של המניה הזו")
    left = sum(b["quantity"] for b in buys) - sold
    if quantity > left + 1e-9:
        raise ValueError(f"אפשר למכור עד {left:g} יחידות")
    db.query("INSERT INTO transactions (symbol, type, date, quantity, gross, fees, tax) VALUES (?, 'sell', ?, ?, ?, ?, ?)",
             [symbol, date, quantity, gross, fees, tax])
    return {"symbol": symbol}


def _sale_rows():
    stocks = {r[0]: (r[1], r[2]) for r in db.query("SELECT symbol, name, currency FROM stocks")}
    txs = db.query("SELECT id, symbol, type, date, quantity, price, gross, fees, tax, fx_rate "
                   "FROM transactions ORDER BY date, id")
    buys, out = {}, []
    for id_, sym, typ, date, qty, price, gross, fees, tax, fx in txs:
        if typ == "buy":
            buys.setdefault(sym, []).append({"quantity": qty, "price": price, "fx_rate": fx})
    for id_, sym, typ, date, qty, price, gross, fees, tax, fx in txs:
        if typ != "sell" or sym not in buys:
            continue
        name, currency = stocks[sym]
        cost = calc.sale_cost(buys[sym], qty, currency)
        res = calc.sale_result(gross, fees, tax, cost)
        out.append({"id": id_, "date": date, "symbol": sym, "name": name, "quantity": qty, "gross": gross,
                    "fees": fees, "tax": tax, "cost": cost, **{"before": res["before"], "after": res["after"], "pct": res["pct"]}})
    return out


def sales(year=None):
    rows = _sale_rows()
    years = sorted({r["date"][:4] for r in rows}, reverse=True)
    if year:
        rows = [r for r in rows if r["date"][:4] == str(year)]
    tot = {k: sum(r[k] for r in rows) for k in ("gross", "fees", "tax", "cost", "before", "after")}
    return {
        "years": years,
        "summary": {**{k: _money(v) for k, v in tot.items()},
                    "pct_before": _pct(tot["before"] / tot["cost"]) if tot["cost"] else None,
                    "pct_after": _pct(tot["after"] / tot["cost"]) if tot["cost"] else None},
        "rows": [{**{k: _money(r[k]) if k in ("gross", "fees", "tax", "cost", "before", "after") else r[k]
                     for k in ("id", "date", "symbol", "name", "quantity", "gross", "fees", "tax", "cost", "before", "after")},
                  "pct": _pct(r["pct"])} for r in sorted(rows, key=lambda r: (r["date"], r["id"]), reverse=True)],
    }


def add_manual(symbol, name, price_now, date, quantity, price, now=None):
    """A holding with no live price source (e.g. a mutual fund): the price is entered by hand, in shekels."""
    now = now or _now()
    symbol = (symbol or "").strip().upper()
    if not SYMBOL_RE.match(symbol):
        raise ValueError("סימול לא תקין")
    if not (name or "").strip():
        raise ValueError("חסר שם")
    if not (price_now and price_now > 0):
        raise ValueError("שער נוכחי חייב להיות חיובי")
    try:
        if date_cls.fromisoformat(date) > now.date():
            raise ValueError("תאריך עתידי")
    except (TypeError, ValueError):
        raise ValueError("תאריך לא תקין")
    if not (quantity and quantity > 0 and price and price > 0):
        raise ValueError("כמות ושער רכישה חייבים להיות חיוביים")
    if db.query("SELECT 1 FROM stocks WHERE symbol = ?", [symbol]):
        raise ValueError("הסימול כבר קיים")
    db.init_schema()
    db.run([
        ("INSERT INTO stocks (symbol, name, list, currency, exchange, added_at) VALUES (?, ?, 'buy', 'ILS', NULL, ?)",
         [symbol, name.strip(), now.isoformat()]),
        ("INSERT INTO manual_prices (symbol, price, updated_at) VALUES (?, ?, ?)", [symbol, price_now, now.isoformat()]),
        ("INSERT INTO transactions (symbol, type, date, quantity, price) VALUES (?, 'buy', ?, ?, ?)",
         [symbol, date, quantity, price]),
    ])
    return {"symbol": symbol}


def set_manual_price(symbol, price, now=None):
    if not (price and price > 0):
        raise ValueError("שער חייב להיות חיובי")
    if not db.query("SELECT 1 FROM manual_prices WHERE symbol = ?", [symbol]):
        raise LookupError("זו לא החזקה עם מחיר ידני")
    db.query("UPDATE manual_prices SET price = ?, updated_at = ? WHERE symbol = ?",
             [price, (now or _now()).isoformat(), symbol])


def set_tx_fx(tx_id, fx_rate):
    if not (fx_rate and fx_rate > 0):
        raise ValueError("שער דולר חייב להיות חיובי")
    rows = db.query("SELECT t.type, s.currency FROM transactions t JOIN stocks s ON s.symbol = t.symbol WHERE t.id = ?", [tx_id])
    if not rows or rows[0][0] != "buy" or rows[0][1] != "USD":
        raise LookupError("אפשר לעדכן שער דולר רק לרכישה של מניה אמריקאית")
    db.query("UPDATE transactions SET fx_rate = ? WHERE id = ?", [fx_rate, tx_id])


def reset_fx(date, fx_rate=None):
    """For purchases whose real date/rate is unknown: set every USD purchase on `date` to one rate
    (default: today's), so the currency effect starts from zero instead of from a made-up date."""
    if fx_rate is None:
        r = db.query("SELECT price FROM quotes WHERE symbol = 'ILS=X'")
        if not r:
            raise ValueError("אין שער דולר שמור. לחץ רענון ונסה שוב")
        fx_rate = r[0][0]
    if not fx_rate > 0:
        raise ValueError("שער דולר חייב להיות חיובי")
    ids = [r[0] for r in db.query(
        "SELECT t.id FROM transactions t JOIN stocks s ON s.symbol = t.symbol "
        "WHERE t.type = 'buy' AND s.currency = 'USD' AND t.date = ?", [date])]
    if not ids:
        raise LookupError("לא נמצאו רכישות אמריקאיות בתאריך הזה")
    db.run([("UPDATE transactions SET fx_rate = ? WHERE id = ?", [fx_rate, i]) for i in ids])
    return {"updated": len(ids), "fx_rate": fx_rate}
