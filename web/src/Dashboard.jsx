import { useState } from "react";
import { Logo } from "./Logo.jsx";
import { DollarIcon, HeartIcon, ImportIcon, PlusIcon, RefreshIcon } from "./Icons.jsx";
import { cur, num, periodStatus, px, signed, ils } from "./api.js";

const NAMES = { TLV: "בורסת תל אביב", US: "וול סטריט", FX: "שער דולר" };

const COLS = [
  ["name", "שם המניה"],
  ["price", "שער נוכחי"],
  ["pct", "שינוי %"],
  ["pl", "שינוי ₪"],
  ["value", "שווי החזקה"],
  ["total", "רווח/הפסד כולל"],
  ["avg", "שער רכישה ממוצע"],
  ["qty", "כמות"],
];

function HoldingsTable({ rows, period, onOpen }) {
  const [sort, setSort] = useState({ key: "value", dir: -1 });
  const items = rows.map((r) => {
    const p = r.periods[period];
    return {
      r,
      name: r.name || r.symbol,
      price: r.price,
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
          {items.map(({ r, name, price, pct, pl, value, total, avg, qty, status }) => (
            <tr key={r.symbol} className="clickrow" onClick={() => onOpen(r.symbol)}>
              <td>
                <div className="namecell">
                  <Logo row={r} />
                  <div>
                    <div>{name}</div>
                    <div className="muted" dir="ltr">{r.symbol}</div>
                  </div>
                </div>
              </td>
              <td dir="ltr">{price == null ? "—" : `${cur(r.currency)}${px(price)}`}</td>
              <td className={clsOf(pct)} dir="ltr">
                {status === "ok" ? `${signed(pct)}%` : <span className="muted">{periodStatus[status]}</span>}
              </td>
              <td className={clsOf(pl)}>{status === "ok" ? ils(pl, true) : "—"}</td>
              <td>{ils(value)}</td>
              <td className={clsOf(total)}>
                {total == null ? "—" : (
                  <>
                    <div>{ils(total, true)}</div>
                    <div dir="ltr">{signed(r.pl_pct)}%</div>
                  </>
                )}
              </td>
              <td dir="ltr">{avg == null ? "—" : `${cur(r.currency)}${px(avg)}`}</td>
              <td>{qty}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {items.length === 0 && <p className="muted">אין עדיין מניות ברשימת הרכישות</p>}
    </div>
  );
}

function Toolbar({ onAdd, onRefresh, onSell, onImport, onWatch, loading }) {
  const items = [
    [onAdd, "הוספת מניה", <PlusIcon />, ""],
    [onRefresh, "רענון נתונים", <RefreshIcon />, loading ? "spin" : ""],
    [onSell, "מכירת מניה", <DollarIcon />, ""],
    [onImport, "ייבוא מקובץ", <ImportIcon />, ""],
    [onWatch, "רשימת מעקב", <HeartIcon />, ""],
  ];
  return (
    <div className="toolbar">
      {items.map(([fn, label, icon, cls]) => (
        <button key={label} className={`iconbtn ${cls}`} onClick={fn} title={label} aria-label={label} disabled={loading && cls === "spin"}>
          {icon}
        </button>
      ))}
    </div>
  );
}

export default function Dashboard({ data, period, actions }) {
  const s = data.summary;
  const pp = data.periods[period];
  const pcls = pp.pl_ils > 0 ? "pos" : pp.pl_ils < 0 ? "neg" : "";
  const cls = s.pl_ils > 0 ? "pos" : s.pl_ils < 0 ? "neg" : "";
  return (
    <section>
      <div className="pair">
      <div className="card hero">
        <div className="muted">שווי תיק</div>
        <div className="big">{ils(s.value_ils)}</div>
        <div className="muted">רווח/הפסד בתקופה</div>
        {pp.status === "ok" ? (
          <div className={`big ${pcls}`}>
            {ils(pp.pl_ils, true)} <span dir="ltr">({signed(pp.pct)}%)</span>
          </div>
        ) : (
          <div className="big muted">{period === "today" ? periodStatus.not_opened : periodStatus.none}</div>
        )}
        <div className="muted">רווח/הפסד כולל</div>
        <div className={`big ${cls}`}>
          {ils(s.pl_ils, true)} <span dir="ltr">({signed(s.pl_pct)}%)</span>
        </div>
      </div>
      <div className="card">
        <div className="muted">רווח ממומש לפני מס</div>
        <div className={`big ${data.realized.before_tax > 0 ? "pos" : data.realized.before_tax < 0 ? "neg" : ""}`}>{ils(data.realized.before_tax, true)}</div>
        <div className="muted">רווח ממומש אחרי מס</div>
        <div className={`big ${data.realized.after_tax > 0 ? "pos" : data.realized.after_tax < 0 ? "neg" : ""}`}>{ils(data.realized.after_tax, true)}</div>
      </div>
      </div>
      <Toolbar {...actions} />
      <HoldingsTable rows={data.buy} period={period} onOpen={actions.onOpen} />
      <div className="card">
        {Object.entries(data.as_of).filter(([m]) => m !== "FX").map(([m, label]) => (
          <div key={m}>{NAMES[m]}: {label}</div>
        ))}
        {Object.keys(data.as_of).length === 0 && <div className="muted">אין עדיין מניות</div>}
      </div>
    </section>
  );
}
