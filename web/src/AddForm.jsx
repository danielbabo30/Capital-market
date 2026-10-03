import { useState } from "react";
import { api } from "./api.js";

export default function AddForm({ onDone, mode = "add", owned = [] }) {
  const [f, setF] = useState({ symbol: mode === "sell" ? (owned[0]?.symbol ?? "") : "", list: mode === "sell" ? "sell" : "buy", date: "", price: "", quantity: "", fx_rate: "", gross: "", fees: "", tax: "", name: "", price_now: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const body = { symbol: f.symbol, list: f.list };
    if (f.list === "manual") {
      Object.assign(body, { name: f.name, price_now: Number(f.price_now), date: f.date, quantity: Number(f.quantity), price: Number(f.price) });
    } else if (f.list === "sell") {
      Object.assign(body, { date: f.date, quantity: Number(f.quantity), gross: Number(f.gross), fees: Number(f.fees || 0), tax: Number(f.tax || 0) });
    } else if (f.list === "buy") {
      body.date = f.date;
      body.price = Number(f.price);
      body.quantity = Number(f.quantity);
      if (f.fx_rate) body.fx_rate = Number(f.fx_rate);
    }
    try {
      await api({ sell: "/api/sales", manual: "/api/manual" }[f.list] || "/api/stocks", { method: "POST", body: JSON.stringify(body) });
      onDone(f.list);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card add" onSubmit={submit}>
      {mode === "sell" ? (
        <label>מניה
          <select value={f.symbol} onChange={set("symbol")} required>
            {owned.map((r) => <option key={r.symbol} value={r.symbol}>{r.name} ({r.symbol}), כמות {r.qty}</option>)}
          </select>
        </label>
      ) : (
        <>
          <label>סימול (ת"א עם סיומת .TA, למשל TEVA.TA)
            <input dir="ltr" value={f.symbol} onChange={set("symbol")} placeholder="AAPL" required />
          </label>
          <label>רשימה
            <select value={f.list} onChange={set("list")}>
              <option value="buy">רכישות</option>
              <option value="watch">מעקב</option>
              <option value="manual">החזקה עם מחיר ידני (קרן וכד')</option>
            </select>
          </label>
        </>
      )}
      {f.list === "manual" && (
        <>
          <p className="muted">לנייר שאין לו שער ב-Yahoo. אפשר להזין מספר נייר כסימול. כל הסכומים בשקלים (לא באגורות), והשער הנוכחי מתעדכן ידנית.</p>
          <label>שם<input value={f.name} onChange={set("name")} required /></label>
          <label>שער נוכחי בשקלים<input type="number" step="any" min="0" value={f.price_now} onChange={set("price_now")} required /></label>
        </>
      )}
      {f.list === "sell" && (
        <>
          <label>תאריך מכירה<input type="date" value={f.date} onChange={set("date")} required /></label>
          <label>כמות שנמכרה<input type="number" step="any" min="0" value={f.quantity} onChange={set("quantity")} required /></label>
          <label>סך תמורה לפני עמלות (בשקלים)
            <input type="number" step="any" min="0" value={f.gross} onChange={set("gross")} required />
          </label>
          <label>סך עמלות (בשקלים)<input type="number" step="any" min="0" value={f.fees} onChange={set("fees")} /></label>
          <label>סך מס (בשקלים)<input type="number" step="any" min="0" value={f.tax} onChange={set("tax")} /></label>
        </>
      )}
      {(f.list === "buy" || f.list === "manual") && (
        <>
          <label>תאריך קנייה<input type="date" value={f.date} onChange={set("date")} required /></label>
          <label>שער קנייה אחרי עמלות (מניות ת"א בשקלים, לא באגורות)
            <input type="number" step="any" min="0" value={f.price} onChange={set("price")} required />
          </label>
          <label>כמות<input type="number" step="any" min="0" value={f.quantity} onChange={set("quantity")} required /></label>
          {f.list === "buy" && (
            <label>שער דולר ביום הקנייה (אופציונלי, רק למניה אמריקאית; ריק = לפי התאריך)
              <input type="number" step="any" min="0" value={f.fx_rate} onChange={set("fx_rate")} />
            </label>
          )}
        </>
      )}
      <button disabled={busy}>{busy ? "מוסיף…" : "הוספה"}</button>
      {error && <p className="error">{error}</p>}
    </form>
  );
}
