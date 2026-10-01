import { useState } from "react";

export default function Login({ onSuccess }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      if (r.ok) return onSuccess();
      if (r.status === 429) {
        const { detail } = await r.json();
        setError(`נעול. נסה שוב בעוד ${Math.ceil(detail.locked_seconds / 60)} דקות.`);
      } else if (r.status >= 500) {
        setError("שגיאת שרת. נסה שוב מאוחר יותר.");
      } else {
        setError("קוד שגוי");
      }
    } catch {
      setError("שגיאת תקשורת");
    } finally {
      setBusy(false);
      setPin("");
    }
  };

  return (
    <main className="center">
      <form onSubmit={submit}>
        <h1>מעקב מניות</h1>
        <input
          type="password"
          inputMode="numeric"
          autoComplete="off"
          maxLength={4}
          placeholder="קוד בן 4 ספרות"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          autoFocus
        />
        <button disabled={busy || pin.length !== 4}>כניסה</button>
        {error && <p className="error">{error}</p>}
      </form>
    </main>
  );
}
