import * as XLSX from "xlsx";

export type SheetSpec = {
  name: string;
  headers: string[];
  rows: unknown[][];
};

export function rowsToXlsx(sheets: SheetSpec[]): Uint8Array {
  const wb = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const name = sheet.name.slice(0, 31) || "גיליון";
    const aoa = [sheet.headers, ...sheet.rows.map((r) => r.map(cellValue))];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = sheet.headers.map((h) => ({ wch: Math.min(36, Math.max(12, h.length + 4)) }));
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  if (wb.SheetNames.length === 0) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["אין נתונים"]]), "ריק");
  }
  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as Uint8Array;
}

function cellValue(value: unknown): string | number {
  if (value === null || value === undefined) return "";
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "boolean") return value ? "כן" : "לא";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function pickColumns(
  rows: Record<string, unknown>[],
  columns: Array<{ key: string; header: string; map?: (row: Record<string, unknown>) => unknown }>,
): { headers: string[]; rows: unknown[][] } {
  return {
    headers: columns.map((c) => c.header),
    rows: rows.map((row) => columns.map((c) => (c.map ? c.map(row) : row[c.key]))),
  };
}

export function nameIndex(
  rows: Record<string, unknown>[] | undefined,
  idField = "id",
  nameField = "name",
): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of rows ?? []) {
    const id = String(row[idField] ?? "");
    if (id) map.set(id, String(row[nameField] ?? id));
  }
  return map;
}

export function safeHebrewFile(name: string): string {
  return name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").trim() || "ללא_שם";
}
