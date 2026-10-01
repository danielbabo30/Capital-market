import { useCallback, useEffect, useState } from "react";
import Login from "./Login.jsx";
import Dashboard from "./Dashboard.jsx";
import StockList from "./StockList.jsx";
import AddForm from "./AddForm.jsx";
import ImportCsv from "./ImportCsv.jsx";
import { api } from "./api.js";

const TABS = [
  ["dashboard", "דשבורד"],
  ["buy", "רכישות"],
  ["watch", "מעקב"],
  ["add", "הוספה"],
  ["import", "ייבוא"],
];

export default function App() {
  const [authed, setAuthed] = useState(null);
  const [tab, setTab] = useState("dashboard");
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

  // Called on app entry and by the refresh button (server applies the 5-minute cache).
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
    if (authed) {
      load();
      refresh();
    }
  }, [authed, load, refresh]);

  const logout = async () => {
    await fetch("/api/logout", { method: "POST" });
    setAuthed(false);
    setData(null);
  };

  if (authed === null) return <main className="center">טוען…</main>;
  if (!authed) return <Login onSuccess={() => setAuthed(true)} />;

  return (
    <div className="app">
      <header>
        <nav>
          {TABS.map(([k, label]) => (
            <button key={k} className={tab === k ? "active" : ""} onClick={() => setTab(k)}>
              {label}
            </button>
          ))}
        </nav>
        <div className="actions">
          <button onClick={refresh} disabled={loading}>{loading ? "מרענן…" : "רענון"}</button>
          <button onClick={logout}>התנתקות</button>
        </div>
      </header>
      {error && <p className="error">{error}</p>}
      {!data ? (
        <p className="muted">טוען…</p>
      ) : tab === "dashboard" ? (
        <Dashboard data={data} />
      ) : tab === "add" ? (
        <AddForm onDone={async () => { await refresh(); setTab("buy"); }} />
      ) : tab === "import" ? (
        <ImportCsv onDone={async () => { await refresh(); setTab("buy"); }} />
      ) : (
        <StockList kind={tab} rows={data[tab]} reload={load} onError={handle} />
      )}
    </div>
  );
}
