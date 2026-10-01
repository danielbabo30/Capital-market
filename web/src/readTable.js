import * as XLSX from "xlsx";

const csvCell = (v) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// Reads a CSV or Excel file and returns CSV text in the import format.
export async function fileToCsv(file) {
  if (!/\.(xlsx|xls)$/i.test(file.name)) return file.text();
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: "" });
  if (rows.length === 0) return "";
  const header = rows[0].map((h) => String(h).trim().toLowerCase());
  const dateCol = header.indexOf("date");
  return rows
    .map((row, i) =>
      header
        .map((_, c) => {
          let v = row[c];
          if (i > 0 && c === dateCol && typeof v === "number") {
            v = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000).toISOString().slice(0, 10); // Excel serial
          }
          return csvCell(v);
        })
        .join(",")
    )
    .join("\n");
}
