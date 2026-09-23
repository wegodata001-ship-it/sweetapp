/** RFC 4180 CSV. Null → empty field. JSON values are stringified. */

export function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  let text: string;
  if (typeof value === "object") {
    text = JSON.stringify(value);
  } else {
    text = String(value);
  }
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function rowsToCsv(rows: Record<string, unknown>[], columns?: string[]): string {
  if (rows.length === 0) {
    if (columns && columns.length > 0) return `${columns.join(",")}\n`;
    return "";
  }
  const cols = columns ?? Object.keys(rows[0]);
  const header = cols.map(csvEscape).join(",");
  const body = rows.map((row) => cols.map((col) => csvEscape(row[col])).join(","));
  return `${[header, ...body].join("\n")}\n`;
}

export function storageManifestCsv(
  rows: Array<{
    dbModel: string;
    dbRecordId: string;
    originalPath: string;
    bucket: string;
    exportedPath: string;
    fileName: string;
    size: number | "";
    checksum: string;
    status: string;
  }>,
): string {
  const columns = [
    "DB Model",
    "DB Record ID",
    "Original Path",
    "Bucket",
    "Exported Path",
    "File Name",
    "Size",
    "Checksum",
    "Status",
  ];
  const mapped = rows.map((r) => ({
    "DB Model": r.dbModel,
    "DB Record ID": r.dbRecordId,
    "Original Path": r.originalPath,
    Bucket: r.bucket,
    "Exported Path": r.exportedPath,
    "File Name": r.fileName,
    Size: r.size,
    Checksum: r.checksum,
    Status: r.status,
  }));
  return rowsToCsv(mapped, columns);
}
