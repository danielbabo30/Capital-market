"""All profit math lives here (server side, one place). Money is rounded to 2 digits only on output."""


def position(buys, sold_qty, price, fx_now, currency):
    """buys: list of dicts with quantity, price, fx_rate (USD stocks). price: current price in the
    stock's own currency (TASE already converted from agorot). Returns None if it can't be priced."""
    bought = sum(b["quantity"] for b in buys)
    qty = bought - sold_qty
    if bought <= 0 or qty <= 0:
        return {"qty": max(qty, 0), "avg_price": None}
    avg = sum(b["quantity"] * b["price"] for b in buys) / bought  # sales never change the average
    out = {"qty": qty, "avg_price": avg}
    if price is None:
        return out
    if currency == "ILS":
        value, cost = qty * price, qty * avg
        out.update(stock_pl=value - cost, fx_pl=0.0)
    else:
        if fx_now is None or any(b.get("fx_rate") is None for b in buys):
            return out
        fx_avg = sum(b["quantity"] * b["price"] * b["fx_rate"] for b in buys) / (bought * avg)
        value, cost = qty * price * fx_now, qty * avg * fx_avg
        # total = value - cost, split into the stock's own move and the currency move
        out.update(stock_pl=qty * (price - avg) * fx_avg, fx_pl=qty * price * (fx_now - fx_avg))
    out.update(value=value, cost=cost, pl=value - cost, pct=(value - cost) / cost if cost else None)
    return out


def summarize(positions):
    """Portfolio %: total P/L over total cost (never an average of per-stock percentages)."""
    priced = [p for p in positions if "pl" in p]
    value = sum(p["value"] for p in priced)
    cost = sum(p["cost"] for p in priced)
    pl = value - cost
    return {"value": value, "cost": cost, "pl": pl, "pct": pl / cost if cost else None}
