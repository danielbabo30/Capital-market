import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import Depends, FastAPI, HTTPException, Request, Response  # noqa: E402
from pydantic import BaseModel  # noqa: E402

from backend import auth, db  # noqa: E402
from backend.quotes import fetch_quotes  # noqa: E402

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


@app.get("/api/quotes", dependencies=[Depends(require_session)])
def quotes(symbols: str = "TEVA.TA,AAPL,ILS=X"):
    syms = [s.strip() for s in symbols.split(",") if s.strip()][:50]
    return fetch_quotes(syms)


@app.post("/api/init-db", dependencies=[Depends(require_session)])
def init_db():
    db.init_schema()
    return {"ok": True}
