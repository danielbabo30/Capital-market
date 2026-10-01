import { useEffect, useState } from "react";
import Login from "./Login.jsx";

export default function App() {
  const [authed, setAuthed] = useState(null); // null = checking

  useEffect(() => {
    fetch("/api/me").then((r) => setAuthed(r.ok)).catch(() => setAuthed(false));
  }, []);

  const logout = async () => {
    await fetch("/api/logout", { method: "POST" });
    setAuthed(false);
  };

  if (authed === null) return <main className="center">טוען…</main>;
  if (!authed) return <Login onSuccess={() => setAuthed(true)} />;

  return (
    <main className="center">
      <h1>מעקב מניות</h1>
      <p>התחברת בהצלחה. הדשבורד ייבנה בשלב 3.</p>
      <button onClick={logout}>התנתקות</button>
    </main>
  );
}
