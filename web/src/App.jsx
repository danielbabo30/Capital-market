import { useCallback, useEffect, useState } from "react";
import Login from "./Login.jsx";
import Dashboard from "./Dashboard.jsx";
import StockList from "./StockList.jsx";
import AddForm from "./AddForm.jsx";
import ImportCsv from "./ImportCsv.jsx";
import Sales from "./Sales.jsx";
import Modal from "./Modal.jsx";
import { api } from "./api.js";

const PERIODS = [
  ["today", "היום"],
  ["yesterday", "אתמול"],
  ["week", "מתחילת השבוע"],
  ["d7", "7 ימים"],
  ["month", "חודש"],
];

export default function App() {
  const [authed, setAuthed] = useState(null);
  const [period, setPeriod] = useState("today");
  const [modal, setModal] = useState(null); // add | sell | import | sales | watch | { stock: symbol }
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handle = (e) => {
    if (e.status === 401) setAuthed(false);
    else setError(e.message || "שגיאת תקשורת");
  };

  // Screens read from the server cache only; Yahoo is pulled solely by refresh().
  const load = useCallback(async () => {
    try {
      setData(await api("/api/portfolio"));
    } catch (e) {
      handle(e);
    }
  }, []);

  // Called by the refresh button and after adding data (server applies the 5-minute cache).
  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      await api("/api/refresh", { method: "POST" });
      await load();
    } catch (e) {
      handle(e);
    } finally {
      setLoading(false);
    }
  }, [load]);

  useEffect(() => {
    fetch("/api/me").then((r) => setAuthed(r.ok)).catch(() => setAuthed(false));
  }, []);

  useEffect(() => {
    if (authed) load(); // entry shows what is already saved; Yahoo is pulled only by the refresh button
  }, [authed, load]);

  if (authed === null) return <main className="center">טוען…</main>;
  if (!authed) return <Login onSuccess={() => setAuthed(true)} />;

  return (
    <div className="app">
      <div className="periods">
        {PERIODS.map(([k, label]) => (
          <button key={k} className={period === k ? "active" : ""} onClick={() => setPeriod(k)}>{label}</button>
        ))}
      </div>
      {error && <p className="error">{error}</p>}
      {!data ? (
        <p className="muted">טוען…</p>
      ) : (
        <Dashboard
          data={data}
          period={period}
          actions={{
            onAdd: () => setModal("add"),
            onSell: () => setModal("sell"),
            onImport: () => setModal("import"),
            onWatch: () => setModal("watch"),
            onRefresh: refresh,
            onOpen: (symbol) => setModal({ stock: symbol }),
            loading,
          }}
        />
      )}

      {modal === "add" && (
        <Modal title="הוספת מניה" onClose={() => setModal(null)}>
          <AddForm onDone={async (kind) => { setModal(null); await refresh(); if (kind === "watch") setModal("watch"); }} />
        </Modal>
      )}
      {modal === "sell" && data && (
        <Modal title="מכירת מניה" onClose={() => setModal(null)}>
          {data.buy.length === 0 ? (
            <p className="muted">אין מניות שאפשר למכור.</p>
          ) : (
            <AddForm mode="sell" owned={data.buy} onDone={async () => { await refresh(); setModal("sales"); }} />
          )}
          <button className="link" onClick={() => setModal("sales")}>היסטוריית מכירות</button>
        </Modal>
      )}
      {modal === "watch" && data && (
        <Modal title="מעקב" onClose={() => setModal(null)}>
          <StockList kind="watch" rows={data.watch} period={period} reload={load} onError={handle} />
        </Modal>
      )}
      {modal === "sales" && (
        <Modal title="מכירות" onClose={() => setModal(null)}>
          <Sales onError={handle} />
        </Modal>
      )}
      {modal === "import" && (
        <Modal title="ייבוא מקובץ" onClose={() => setModal(null)}>
          <ImportCsv reload={load} onDone={async () => { setModal(null); await refresh(); }} />
        </Modal>
      )}
      {modal?.stock && data && (() => {
        const row = data.buy.find((r) => r.symbol === modal.stock);
        if (!row) return null;
        return (
          <Modal title={row.name || row.symbol} onClose={() => setModal(null)}>
            <StockList kind="buy" rows={[row]} period={period} reload={load} onError={handle} />
          </Modal>
        );
      })()}
    </div>
  );
}
