import { num, signed } from "./api.js";

const NAMES = { TLV: "בורסת תל אביב", US: "וול סטריט", FX: "שער דולר" };

export default function Dashboard({ data }) {
  const s = data.summary;
  const cls = s.pl_ils > 0 ? "pos" : s.pl_ils < 0 ? "neg" : "";
  return (
    <section>
      <div className="card">
        <div className="muted">שווי תיק</div>
        <div className="big">₪{num(s.value_ils)}</div>
        <div className="muted">רווח/הפסד כולל</div>
        <div className={`big ${cls}`}>
          ₪{signed(s.pl_ils)} <span dir="ltr">({signed(s.pl_pct)}%)</span>
        </div>
      </div>
      <div className="card">
        {Object.entries(data.as_of).filter(([m]) => m !== "FX").map(([m, label]) => (
          <div key={m}>{NAMES[m]}: {label}</div>
        ))}
        {Object.keys(data.as_of).length === 0 && <div className="muted">אין עדיין מניות</div>}
      </div>
    </section>
  );
}
