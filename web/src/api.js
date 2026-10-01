export async function api(path, options = {}) {
  const r = await fetch(path, {
    ...options,
    headers: options.body ? { "Content-Type": "application/json" } : undefined,
  });
  if (r.status === 401) throw Object.assign(new Error("unauthorized"), { status: 401 });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(typeof data.detail === "string" ? data.detail : "שגיאה"), { status: r.status });
  return data;
}

const nf = new Intl.NumberFormat("he-IL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const num = (x) => (x == null ? "—" : nf.format(x));
export const signed = (x) => (x == null ? "—" : (x > 0 ? "+" : "") + nf.format(x));
export const cur = (c) => (c === "USD" ? "$" : "₪");
