"""Market hours, used only to decide whether a re-pull is worthwhile."""
from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

CACHE = timedelta(minutes=5)
CLOSE_GRACE = timedelta(minutes=20)  # TASE data is ~15 min delayed

TZ = {
    "TLV": ZoneInfo("Asia/Jerusalem"),
    "US": ZoneInfo("America/New_York"),
    "FX": ZoneInfo("America/New_York"),
}
# Deliberately generous closing times: we skip a re-pull only when the last pull came after these.
HOURS = {"TLV": (time(9, 0), time(17, 30)), "US": (time(9, 30), time(16, 0)), "FX": (time(0, 0), time(23, 59))}


def market_of(symbol):
    if symbol.endswith(".TA"):
        return "TLV"
    if symbol.endswith("=X"):
        return "FX"
    return "US"


def is_open(market, now):
    local = now.astimezone(TZ[market])
    start, end = HOURS[market]
    return local.weekday() < 5 and start <= local.time() <= end


def last_close(market, now):
    tz = TZ[market]
    local = now.astimezone(tz)
    for back in range(8):
        day = local.date() - timedelta(days=back)
        if day.weekday() < 5:
            c = datetime.combine(day, HOURS[market][1], tz)
            if c <= now:
                return c
    return None


def needs_refresh(market, fetched_at, now):
    """fetched_at: aware datetime of the previous pull, or None."""
    if fetched_at is None:
        return True
    if now - fetched_at < CACHE:
        return False
    if not is_open(market, now):
        lc = last_close(market, now)
        if lc and fetched_at >= lc + CLOSE_GRACE:
            return False  # closing data already stored
    return True


def as_of_label(quote_time, fetched_at):
    """quote_time/fetched_at: aware datetimes. Always the quote's trading time, never the pull time.
    A quote lagging the pull by >30 min means the market is closed."""
    il = quote_time.astimezone(TZ["TLV"])
    if fetched_at - quote_time > timedelta(minutes=30):
        return f"סגירה, {il.day}.{il.month}"
    return f"נכון ל-{il:%H:%M}"
