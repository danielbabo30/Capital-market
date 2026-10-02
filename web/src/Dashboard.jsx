import { num, periodStatus, signed } from "./api.js";

const NAMES = { TLV: "בורסת תל אביב", US: "וול סטריט", FX: "שער דולר" };

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
      <div className="card">
        {Object.entries(data.as_of).filter(([m]) => m !== "FX").map(([m, label]) => (
          <div key={m}>{NAMES[m]}: {label}</div>
        ))}
        {Object.keys(data.as_of).length === 0 && <div className="muted">אין עדיין מניות</div>}
      </div>
    </section>
  );
}
