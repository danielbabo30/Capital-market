import { useState } from "react";
import { cur, num, periodStatus, signed } from "./api.js";

const NAMES = { TLV: "בורסת תל אביב", US: "וול סטריט", FX: "שער דולר" };

const COLS = [
  ["name", "שם המניה"],
  ["pct", "שינוי %"],
  ["pl", "שינוי ₪"],
  ["value", "שווי החזקה"],
  ["total", "רווח/הפסד כולל"],
  ["avg", "שער רכישה ממוצע"],
  ["qty", "כמות"],
];

function HoldingsTable({ rows, period }) {
  const [sort, setSort] = useState({ key: "value", dir: -1 });
  const items = rows.map((r) => {
    const p = r.periods[period];
    return {
      r,
      name: r.name || r.symbol,
      pct: p.status === "ok" ? p.pct : null,
      pl: p.status === "ok" ? p.pl_ils : null,
      value: r.value_ils,
      total: r.pl_ils,
      avg: r.avg_price,
      qty: r.qty,
      status: p.status,
    };
  });
  // Rows without a value (e.g. today not opened) always sink to the bottom.
  items.sort((a, b) => {
    const x = a[sort.key], y = b[sort.key];
    if (x == null && y == null) return 0;
    if (x == null) return 1;
    if (y == null) return -1;
    return typeof x === "string" ? sort.dir * x.localeCompare(y, "he") : sort.dir * (x - y);
  });
  const clsOf = (x) => (x > 0 ? "pos" : x < 0 ? "neg" : "");
  const click = (key) => setSort((s) => ({ key, dir: s.key === key ? -s.dir : key === "name" ? 1 : -1 }));

  return (
    <div className="card tablewrap">
      <table>
        <thead>
          <tr>
            {COLS.map(([k, label]) => (
              <th key={k} onClick={() => click(k)}>
                {label}{sort.key === k ? (sort.dir > 0 ? " ▲" : " ▼") : ""}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map(({ r, name, pct, pl, value, total, avg, qty, status }) => (
            <tr key={r.symbol}>
              <td>
                <div>{name}</div>
                <div className="muted" dir="ltr">{r.symbol}</div>
              </td>
              <td className={clsOf(pct)} dir="ltr">
                {status === "ok" ? `${signed(pct)}%` : <span className="muted">{periodStatus[status]}</span>}
              </td>
              <td className={clsOf(pl)}>{status === "ok" ? `₪${signed(pl)}` : "—"}</td>
              <td>{value == null ? "—" : `₪${num(value)}`}</td>
              <td className={clsOf(total)}>
                {total == null ? "—" : (
                  <>
                    <div>₪{signed(total)}</div>
                    <div dir="ltr">{signed(r.pl_pct)}%</div>
                  </>
                )}
              </td>
              <td dir="ltr">{avg == null ? "—" : `${cur(r.currency)}${num(avg)}`}</td>
              <td>{qty}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {items.length === 0 && <p className="muted">אין עדיין מניות ברשימת הרכישות</p>}
    </div>
  );
}

export default function Dashboard({ data, period }) {
  const s = data.summary;
  const pp = data.periods[period];
  const pcls = pp.pl_ils > 0 ? "pos" : pp.pl_ils < 0 ? "neg" : "";
  const cls = s.pl_ils > 0 ? "pos" : s.pl_ils < 0 ? "neg" : "";
  return (
    <section>
      <div className="card">
        <div className="muted">שווי תיק</div>
        <div className="big">₪{num(s.value_ils)}</div>
        <div className="muted">רווח/הפסד בתקופה</div>
        {pp.status === "ok" ? (
          <div className={`big ${pcls}`}>
            ₪{signed(pp.pl_ils)} <span dir="ltr">({signed(pp.pct)}%)</span>
          </div>
        ) : (
          <div className="big muted">{period === "today" ? periodStatus.not_opened : periodStatus.none}</div>
        )}
        <div className="muted">רווח/הפסד כולל</div>
        <div className={`big ${cls}`}>
          ₪{signed(s.pl_ils)} <span dir="ltr">({signed(s.pl_pct)}%)</span>
        </div>
      </div>
      <div className="card">
        <div className="muted">רווח ממומש (מכירות)</div>
        <div className="row">
          <span>לפני מס</span><span className={data.realized.before_tax > 0 ? "pos" : data.realized.before_tax < 0 ? "neg" : ""}>₪{signed(data.realized.before_tax)}</span>
        </div>
        <div className="row">
          <span>אחרי מס</span><span className={data.realized.after_tax > 0 ? "pos" : data.realized.after_tax < 0 ? "neg" : ""}>₪{signed(data.realized.after_tax)}</span>
        </div>
      </div>
      <HoldingsTable rows={data.buy} period={period} />
      <div className="card">
        {Object.entries(data.as_of).filter(([m]) => m !== "FX").map(([m, label]) => (
          <div key={m}>{NAMES[m]}: {label}</div>
        ))}
        {Object.keys(data.as_of).length === 0 && <div className="muted">אין עדיין מניות</div>}
      </div>
    </section>
  );
}
