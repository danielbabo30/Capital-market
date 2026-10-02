import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import Depends, FastAPI, HTTPException, Request, Response  # noqa: E402
from typing import Optional  # noqa: E402

from pydantic import BaseModel  # noqa: E402

from backend import auth, db, importer, service  # noqa: E402

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)


def require_session(request: Request):
    if not auth.valid_token(request.cookies.get(auth.COOKIE, "")):
        raise HTTPException(401, "unauthorized")


class Login(BaseModel):
    pin: str


@app.post("/api/login")
def login(body: Login, response: Response):
    if not (len(body.pin) == 4 and body.pin.isdigit()):
        raise HTTPException(400, "bad pin format")
    result, wait = auth.attempt_login(body.pin)
    if result == "locked":
        raise HTTPException(429, detail={"locked_seconds": wait})
    if result == "bad":
        raise HTTPException(401, "wrong pin")
    response.set_cookie(
        auth.COOKIE, auth.make_token(), max_age=auth.SESSION_SECONDS,
        httponly=True, secure=True, samesite="strict", path="/",
    )
    return {"ok": True}


@app.post("/api/logout")
def logout(response: Response):
    response.delete_cookie(auth.COOKIE, path="/")
    return {"ok": True}


@app.get("/api/me", dependencies=[Depends(require_session)])
def me():
    return {"ok": True}


@app.post("/api/init-db", dependencies=[Depends(require_session)])
def init_db():
    db.init_schema()
    return {"ok": True}



class AddStock(BaseModel):
    symbol: str
    list: str
    date: Optional[str] = None
    price: Optional[float] = None
    quantity: Optional[float] = None
    fx_rate: Optional[float] = None


def _guard(fn, *a, **kw):
    try:
        return fn(*a, **kw)
    except LookupError as e:
        raise HTTPException(404, str(e))
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.post("/api/refresh", dependencies=[Depends(require_session)])
def refresh():
    return service.refresh()


@app.get("/api/portfolio", dependencies=[Depends(require_session)])
def portfolio():
    return service.portfolio()


@app.post("/api/stocks", dependencies=[Depends(require_session)])
def add_stock(body: AddStock):
    return _guard(service.add_stock, body.symbol, body.list, body.date, body.price, body.quantity, body.fx_rate)


@app.delete("/api/stocks/{symbol}", dependencies=[Depends(require_session)])
def delete_stock(symbol: str):
    service.delete_stock(symbol.upper())
    return {"ok": True}


@app.delete("/api/transactions/{tx_id}", dependencies=[Depends(require_session)])
def delete_transaction(tx_id: int):
    return _guard(service.delete_transaction, tx_id) or {"ok": True}


class CsvBody(BaseModel):
    csv: str


@app.post("/api/import/preview", dependencies=[Depends(require_session)])
def import_preview(body: CsvBody):
    return _guard(importer.preview, body.csv)


@app.post("/api/import/commit", dependencies=[Depends(require_session)])
def import_commit(body: CsvBody):
    return _guard(importer.commit, body.csv)


class Sale(BaseModel):
    symbol: str
    date: str
    quantity: float
    gross: float
    fees: float
    tax: float


@app.post("/api/sales", dependencies=[Depends(require_session)])
def add_sale(body: Sale):
    return _guard(service.add_sale, body.symbol, body.date, body.quantity, body.gross, body.fees, body.tax)


@app.get("/api/sales", dependencies=[Depends(require_session)])
def sales(year: Optional[int] = None):
    return service.sales(year)


class Manual(BaseModel):
    symbol: str
    name: str
    price_now: float
    date: str
    quantity: float
    price: float


class ManualPrice(BaseModel):
    price: float


@app.post("/api/manual", dependencies=[Depends(require_session)])
def add_manual(body: Manual):
    return _guard(service.add_manual, body.symbol, body.name, body.price_now, body.date, body.quantity, body.price)


@app.post("/api/manual/{symbol}/price", dependencies=[Depends(require_session)])
def set_manual_price(symbol: str, body: ManualPrice):
    return _guard(service.set_manual_price, symbol.upper(), body.price) or {"ok": True}
