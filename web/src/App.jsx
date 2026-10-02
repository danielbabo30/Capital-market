import { useCallback, useEffect, useState } from "react";
import Login from "./Login.jsx";
import Dashboard from "./Dashboard.jsx";
import StockList from "./StockList.jsx";
import AddForm from "./AddForm.jsx";
import ImportCsv from "./ImportCsv.jsx";
import Sales from "./Sales.jsx";
import { api } from "./api.js";

const PERIODS = [
  ["today", "היום"],
  ["week", "מתחילת השבוע"],
  ["d7", "7 ימים"],
  ["month", "חודש"],
];

const TABS = [
  ["dashboard", "דשבורד"],
  ["buy", "רכישות"],
  ["watch", "מעקב"],
  ["sales", "מכירות"],
  ["add", "הוספה"],
  ["import", "ייבוא"],
];

export default function App() {
  const [authed, setAuthed] = useState(null);
  const [tab, setTab] = useState("dashboard");
  const [period, setPeriod] = useState("today");
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
        <div className="brand">מעקב מניות</div>
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
      {["dashboard", "buy", "watch"].includes(tab) && (
        <div className="periods">
          {PERIODS.map(([k, label]) => (
            <button key={k} className={period === k ? "active" : ""} onClick={() => setPeriod(k)}>{label}</button>
          ))}
        </div>
      )}
      {error && <p className="error">{error}</p>}
      {!data ? (
        <p className="muted">טוען…</p>
      ) : tab === "dashboard" ? (
        <Dashboard data={data} period={period} />
      ) : tab === "add" ? (
        <AddForm onDone={async (kind) => { await refresh(); setTab(kind === "sell" ? "sales" : "buy"); }} />
      ) : tab === "sales" ? (
        <Sales onError={handle} />
      ) : tab === "import" ? (
        <ImportCsv onDone={async () => { await refresh(); setTab("buy"); }} />
      ) : (
        <StockList kind={tab} rows={data[tab]} period={period} reload={load} onError={handle} />
      )}
    </div>
  );
}
