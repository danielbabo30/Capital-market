import { api, cur, num, periodStatus, px, signed } from "./api.js";

export default function StockList({ kind, rows, period, reload, onError }) {
  const del = async (path, msg) => {
    if (!confirm(msg)) return;
    try { await api(path, { method: "DELETE" }); await reload(); } catch (e) { onError(e); }
  };
  const setPrice = async (r) => {
    const v = prompt(`שער חדש ל-${r.name} (בשקלים, לא באגורות):`, r.price);
    if (v == null || v === "") return;
    try {
      await api(`/api/manual/${r.symbol}/price`, { method: "POST", body: JSON.stringify({ price: Number(v) }) });
      await reload();
    } catch (e) { onError(e); }
  };
  if (rows.length === 0) return <p className="muted">הרשימה ריקה. אפשר להוסיף מניה בלשונית "הוספה".</p>;
  return (
    <section>
      {rows.map((r) => {
        const cls = r.pl_ils > 0 ? "pos" : r.pl_ils < 0 ? "neg" : "";
        const pr = r.periods[period];
        const pcls = (pr.pl_ils ?? pr.pct) > 0 ? "pos" : (pr.pl_ils ?? pr.pct) < 0 ? "neg" : "";
        return (
          <div className="card" key={r.symbol}>
            <div className="row">
              <strong>{r.symbol}</strong>
              <span className="muted">{r.name}</span>
            </div>
            <div className="row">
              <span className="big" dir="ltr">{cur(r.currency)}{px(r.price)}</span>
              <span className="muted">
                {r.price == null ? "אין נתון" : r.as_of}
                {r.stale && <b className="neg"> · לא עודכן</b>}
              </span>
            </div>
            {kind === "watch" && (
              <div className={`row ${pcls}`}>
                <span>שינוי בתקופה</span>
                {pr.status === "ok" ? <span dir="ltr">{signed(pr.pct)}%</span> : <span className="muted">{periodStatus[pr.status]}</span>}
              </div>
            )}
            {kind === "buy" && (
              <>
                <div className={`row ${pcls}`}>
                  <span>רווח בתקופה</span>
                  {pr.status === "ok" ? (
                    <span>₪{signed(pr.pl_ils)} <span dir="ltr">({signed(pr.pct)}%)</span></span>
                  ) : (
                    <span className="muted">{periodStatus[pr.status]}</span>
                  )}
                </div>
                <div className="row"><span>כמות</span><span>{r.qty}</span></div>
                <div className="row"><span>שער ממוצע</span><span dir="ltr">{cur(r.currency)}{px(r.avg_price)}</span></div>
                <div className="row"><span>שווי</span><span>₪{num(r.value_ils)}</span></div>
                <div className={`row ${cls}`}>
                  <span>רווח כולל</span>
                  <span>₪{signed(r.pl_ils)} <span dir="ltr">({signed(r.pl_pct)}%)</span></span>
                </div>
                {r.currency === "USD" && r.pl_ils != null && (
                  <div className="row muted">
                    <span>מזה: מניה / מטבע</span>
                    <span>₪{signed(r.stock_pl_ils)} / ₪{signed(r.fx_pl_ils)}</span>
                  </div>
                )}
                <details>
                  <summary>רכישות ({r.transactions.length})</summary>
                  {r.transactions.map((t) => (
                    <div className="row" key={t.id}>
                      <span>{t.date} · {t.quantity} × {cur(r.currency)}{px(t.price)}</span>
                      <button className="link" onClick={() => del(`/api/transactions/${t.id}`, "למחוק את הרכישה?")}>מחק</button>
                    </div>
                  ))}
                </details>
              </>
            )}
            <div className="row links">
              {r.manual && <button className="link" onClick={() => setPrice(r)}>עדכן שער</button>}
              {r.google_url && <a href={r.google_url} target="_blank" rel="noreferrer">Google Finance</a>}
              {r.yahoo_url && <a href={r.yahoo_url} target="_blank" rel="noreferrer">Yahoo</a>}
              <button className="link" onClick={() => del(`/api/stocks/${r.symbol}`, `למחוק את ${r.symbol} וכל הרכישות שלה?`)}>מחק מניה</button>
            </div>
          </div>
        );
      })}
    </section>
  );
}
