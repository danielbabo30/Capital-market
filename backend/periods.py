"""Period start dates and base (opening) prices. Pure functions."""
from datetime import timedelta

PERIODS = ["today", "week", "d7", "month"]


def starts(today):
    """Calendar start date of each period (today: a date)."""
    return {
        "today": today,
        "week": today - timedelta(days=today.weekday()),  # Monday
        "d7": today - timedelta(days=7),
        "month": today.replace(day=1),
    }


def bases(bars, today, quote_open=None):
    """bars: [(iso_date, open)] ascending. Returns {period: (start_iso, base_open | None, status)}.
    status: ok / not_opened (today's session has not started) / no_data.
    Base is the open of the first trading day on or after the period's start date."""
    st = starts(today)
    today_iso = today.isoformat()
    today_open = next((o for d, o in bars if d == today_iso), quote_open)
    out = {}
    for p in PERIODS:
        start = st[p].isoformat()
        if p == "today":
            base = today_open
        else:
            base = next((o for d, o in bars if d >= start), None)
        if base is not None:
            out[p] = (start, base, "ok")
        else:  # no opening price yet: the period's first session has not started (or history is missing)
            out[p] = (start, None, "not_opened" if today_open is None else "no_data")
    return out
