import { useState } from "react";
import { api } from "./api.js";
import { fileToCsv } from "./readTable.js";

const ACTION = { buy: "קנייה", sell: "מכירה", watch: "מעקב" };

export default function ImportCsv({ onDone }) {
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const pick = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setFileName(file.name);
    setPreview(null);
    setError("");
    try {
      setText(await fileToCsv(file));
    } catch {
      setText("");
      setError("לא ניתן לקרוא את הקובץ");
    }
  };

  const call = async (path, after) => {
    setBusy(true);
    setError("");
    try {
      after(await api(path, { method: "POST", body: JSON.stringify({ csv: text }) }));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <div className="card add">
        <label>קובץ CSV או Excel
          <input type="file" accept=".csv,.xlsx,.xls,text/csv" onChange={pick} />
        </label>
        <div className="muted" dir="ltr">symbol,action,date,quantity,price,gross,fees,tax,fx_rate</div>
        <button disabled={busy || !text} onClick={() => call("/api/import/preview", setPreview)}>
          {busy && !preview ? "בודק…" : "תצוגה מקדימה"}
        </button>
        {error && <p className="error">{error}</p>}
      </div>
      {preview && (
        <div className="card">
          <div className="row">
            <strong>{fileName}</strong>
            <span>{preview.ok} תקינות · <b className={preview.errors ? "neg" : ""}>{preview.errors} שגויות</b></span>
          </div>
          {preview.rows.map((r) => (
            <div className={`row prev ${r.error ? "neg" : ""}`} key={r.line}>
              <span dir="ltr">{r.line}. {r.symbol}</span>
              <span>{ACTION[r.action] || r.action} {r.date || ""} {r.quantity ?? ""} {r.price != null ? `× ${r.price}` : ""}</span>
              {r.error && <span>{r.error}</span>}
            </div>
          ))}
          <button
            disabled={busy || preview.errors > 0 || preview.ok === 0}
            onClick={() => call("/api/import/commit", () => onDone())}
          >
            {busy ? "שומר…" : `אישור ושמירה של ${preview.ok} שורות`}
          </button>
          {preview.errors > 0 && <p className="muted">צריך לתקן את השורות השגויות בקובץ ולטעון אותו שוב.</p>}
        </div>
      )}
    </section>
  );
}
