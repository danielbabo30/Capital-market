import { api } from "./api.js";

// Shrinks the chosen image to a small square in the browser, so only a few KB are stored.
function toSmallDataUrl(file, size = 96) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = c.height = size;
      const side = Math.min(img.width, img.height);
      c.getContext("2d").drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
      URL.revokeObjectURL(url);
      const webp = c.toDataURL("image/webp", 0.85);
      resolve(webp.startsWith("data:image/webp") ? webp : c.toDataURL("image/png"));
    };
    img.onerror = () => reject(new Error("לא ניתן לקרוא את התמונה"));
    img.src = url;
  });
}

export function Logo({ row, size = 30 }) {
  const style = { width: size, height: size };
  return row.logo ? (
    <img className="logo" style={style} src={row.logo} alt="" />
  ) : (
    <span className="logo ph" style={{ ...style, fontSize: size * 0.4 }}>{row.symbol.slice(0, 2)}</span>
  );
}

export function LogoControls({ row, reload, onError }) {
  const pick = async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    try {
      const data = await toSmallDataUrl(file);
      await api(`/api/stocks/${row.symbol}/logo`, { method: "POST", body: JSON.stringify({ data }) });
      await reload();
    } catch (err) {
      onError(err);
    }
  };
  const remove = async () => {
    try { await api(`/api/stocks/${row.symbol}/logo`, { method: "DELETE" }); await reload(); } catch (err) { onError(err); }
  };
  return (
    <>
      <label className="link filelink">
        {row.logo ? "החלף לוגו" : "הוסף לוגו"}
        <input type="file" accept="image/*" hidden onChange={pick} />
      </label>
      {row.logo && <button className="link" onClick={remove}>הסר לוגו</button>}
    </>
  );
}
