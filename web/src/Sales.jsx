import { useEffect, useState } from "react";
import { api, num, signed } from "./api.js";

const cls = (x) => (x > 0 ? "pos" : x < 0 ? "neg" : "");

export default function Sales({ onError }) {
  const [year, setYear] = useState("");
  const [data, setData] = useState(null);

  const load = async (y = year) => {
    try {
      setData(await api("/api/sales" + (y ? `?year=${y}` : "")));
    } catch (e) {
      onError(e);
    }
  };
  useEffect(() => { load(); }, []);

  const del = async (id) => {
    if (!confirm("למחוק את המכירה?")) return;
    try { await api(`/api/transactions/${id}`, { method: "DELETE" }); await load(); } catch (e) { onError(e); }
  };

  if (!data) return <p className="muted">טוען…</p>;
  const s = data.summary;
  return (
    <section>
      <div className="periods">
        <button className={year === "" ? "active" : ""} onClick={() => { setYear(""); load(""); }}>הכול</button>
        {data.years.map((y) => (
          <button key={y} className={year === y ? "active" : ""} onClick={() => { setYear(y); load(y); }}>{y}</button>
        ))}
      </div>
      <div className="card">
        <div className="row"><span>סך תמורה</span><span>₪{num(s.gross)}</span></div>
        <div className="row"><span>עמלות</span><span>₪{num(s.fees)}</span></div>
        <div className="row"><span>מס</span><span>₪{num(s.tax)}</span></div>
        <div className={`row ${cls(s.before)}`}>
          <span>רווח/הפסד לפני מס</span>
          <span>₪{signed(s.before)} <span dir="ltr">({signed(s.pct_before)}%)</span></span>
        </div>
        <div className={`row ${cls(s.after)}`}>
          <span>רווח/הפסד אחרי מס</span>
          <span>₪{signed(s.after)} <span dir="ltr">({signed(s.pct_after)}%)</span></span>
        </div>
      </div>
      {data.rows.length === 0 && <p className="muted">אין מכירות. אפשר להוסיף בלשונית "הוספה".</p>}
      {data.rows.map((r) => (
        <div className="card" key={r.id}>
          <div className="row"><strong dir="ltr">{r.symbol}</strong><span className="muted">{r.date}</span></div>
          <div className="row"><span>כמות</span><span>{r.quantity}</span></div>
          <div className="row"><span>תמורה / עמלות / מס</span><span>₪{num(r.gross)} / {num(r.fees)} / {num(r.tax)}</span></div>
          <div className="row"><span>עלות</span><span>₪{num(r.cost)}</span></div>
          <div className={`row ${cls(r.before)}`}>
            <span>רווח לפני מס</span>
            <span>₪{signed(r.before)} <span dir="ltr">({signed(r.pct)}%)</span></span>
          </div>
          <div className={`row ${cls(r.after)}`}><span>רווח אחרי מס</span><span>₪{signed(r.after)}</span></div>
          <div className="row links"><button className="link" onClick={() => del(r.id)}>מחק</button></div>
        </div>
      ))}
    </section>
  );
}
