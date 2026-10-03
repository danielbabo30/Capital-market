import { useEffect } from "react";

export default function Modal({ title, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modalhead">
          <strong>{title}</strong>
          <button className="x" onClick={onClose} aria-label="סגירה">×</button>
        </div>
        <div className="modalbody">{children}</div>
      </div>
    </div>
  );
}
