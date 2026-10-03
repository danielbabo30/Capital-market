"""Period start dates and base (opening) prices. Pure functions."""
from datetime import timedelta

PERIODS = ["today", "yesterday", "week", "d7", "month"]


def starts(today):
    """Calendar start date of each period (today: a date)."""
    return {
        "today": today,
        "yesterday": today,  # replaced in bases() by the last trading day before today
        "week": today - timedelta(days=today.weekday()),  # Monday
        "d7": today - timedelta(days=7),
        "month": today.replace(day=1),
    }


def bases(bars, today, quote_open=None):
    """bars: [(iso_date, open, close)] ascending.
    Returns {period: (start_iso, base_open | None, status, end_price | None)}.
    Base is the open of the first trading day on or after the period's start date; end_price is None
    (= the current price) except for "yesterday", which is that day's own open -> close.
    status: ok / not_opened (today's session has not started) / no_data."""
    st = starts(today)
    today_iso = today.isoformat()
    today_open = next((o for d, o, _c in bars if d == today_iso), quote_open)
    out = {}
    for p in PERIODS:
        start = st[p].isoformat()
        if p == "yesterday":
            prev = next(((d, o, c) for d, o, c in reversed(bars) if d < today_iso), None)
            out[p] = (prev[0], prev[1], "ok", prev[2]) if prev else (start, None, "no_data", None)
            continue
        if p == "today":
            base = today_open
        else:
            base = next((o for d, o, _c in bars if d >= start), None)
        if base is not None:
            out[p] = (start, base, "ok", None)
        else:  # no opening price yet: the period's first session has not started (or history is missing)
            out[p] = (start, None, "not_opened" if today_open is None else "no_data", None)
    return out
