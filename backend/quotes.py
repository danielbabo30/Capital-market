"""Bulk quote fetch via yfinance.

One bulk request for all symbols. TASE prices arrive in agorot (ILA) and are
converted to shekels here, once, so every other field is already in ILS.
"""
from datetime import timezone

import yfinance as yf

DEFAULT_SYMBOLS = ["TEVA.TA", "AAPL", "ILS=X"]
MAX_SYMBOLS = 50


def fetch_quotes(symbols):
    # Single bulk call: 1-minute bars for the latest session, all symbols.
    data = yf.download(
        symbols, period="1d", interval="1m", group_by="ticker",
        auto_adjust=False, progress=False, threads=True,
    )
    tickers = yf.Tickers(" ".join(symbols))
    out = {}
    for sym in symbols:
        try:
            df = data[sym] if len(symbols) > 1 else data
            df = df.dropna(subset=["Close"])
            if df.empty:
                raise ValueError("no data")
            currency = tickers.tickers[sym].fast_info.get("currency")
            price = float(df["Close"].iloc[-1])
            day_open = float(df["Open"].iloc[0])
            if currency == "ILA":  # agorot -> shekels, the only place this happens
                price, day_open, currency = price / 100, day_open / 100, "ILS"
            qt = df.index[-1]
            out[sym] = {
                "price": round(price, 4),
                "day_open": round(day_open, 4),
                "currency": currency,
                "quote_time": qt.isoformat(),  # trading time of the quote, not fetch time
                "quote_time_utc": qt.astimezone(timezone.utc).isoformat(),
            }
        except Exception as e:  # one bad symbol must not sink the rest
            out[sym] = {"error": str(e)}
    return out
