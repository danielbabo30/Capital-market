import { useState } from "react";
import { api } from "./api.js";

export default function AddForm({ onDone }) {
  const [f, setF] = useState({ symbol: "", list: "buy", date: "", price: "", quantity: "", fx_rate: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const body = { symbol: f.symbol, list: f.list };
    if (f.list === "buy") {
      body.date = f.date;
      body.price = Number(f.price);
      body.quantity = Number(f.quantity);
      if (f.fx_rate) body.fx_rate = Number(f.fx_rate);
    }
    try {
      await api("/api/stocks", { method: "POST", body: JSON.stringify(body) });
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card add" onSubmit={submit}>
      <label>סימול (ת"א עם סיומת .TA, למשל TEVA.TA)
        <input dir="ltr" value={f.symbol} onChange={set("symbol")} placeholder="AAPL" required />
      </label>
      <label>רשימה
        <select value={f.list} onChange={set("list")}>
          <option value="buy">רכישות</option>
          <option value="watch">מעקב</option>
        </select>
      </label>
      {f.list === "buy" && (
        <>
          <label>תאריך קנייה<input type="date" value={f.date} onChange={set("date")} required /></label>
          <label>שער קנייה אחרי עמלות (מניות ת"א בשקלים, לא באגורות)
            <input type="number" step="any" min="0" value={f.price} onChange={set("price")} required />
          </label>
          <label>כמות<input type="number" step="any" min="0" value={f.quantity} onChange={set("quantity")} required /></label>
          <label>שער דולר ביום הקנייה (אופציונלי, רק למניה אמריקאית; ריק = לפי התאריך)
            <input type="number" step="any" min="0" value={f.fx_rate} onChange={set("fx_rate")} />
          </label>
        </>
      )}
      <button disabled={busy}>{busy ? "מוסיף…" : "הוספה"}</button>
      {error && <p className="error">{error}</p>}
    </form>
  );
}
