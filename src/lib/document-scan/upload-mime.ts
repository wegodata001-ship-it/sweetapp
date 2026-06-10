export const SCAN_ACCEPT_MIME =
  "image/jpeg,image/jpg,image/png,image/webp,application/pdf";

export function resolveUploadMimeType(file: Pick<File, "type" | "name">): string {
  let mime = (file.type ?? "").trim() || "application/octet-stream";
  const name = file.name ?? "";
  if (mime === "application/octet-stream" || !mime) {
    if (/\.pdf$/i.test(name)) mime = "application/pdf";
    else if (/\.png$/i.test(name)) mime = "image/png";
    else if (/\.jpe?g$/i.test(name)) mime = "image/jpeg";
    else if (/\.webp$/i.test(name)) mime = "image/webp";
  }
  return mime;
}

export function isPdfFile(file: Pick<File, "type" | "name">): boolean {
  return resolveUploadMimeType(file) === "application/pdf";
}

export function isPdfMimeType(mimeType: string): boolean {
  return mimeType === "application/pdf";
}

/** הערכת מספר עמודים ב-PDF (לתצוגה לפני סריקה) */
export async function estimatePdfPageCount(source: ArrayBuffer | Pick<File, "arrayBuffer">): Promise<number> {
  const buffer = source instanceof ArrayBuffer ? source : await source.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 4) return 0;
  if (String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!) !== "%PDF") return 0;

  const text = new TextDecoder("latin1").decode(bytes);
  const countMatches = [...text.matchAll(/\/Count\s+(\d+)/g)];
  if (countMatches.length > 0) {
    const counts = countMatches
      .map((match) => parseInt(match[1] ?? "", 10))
      .filter((count) => Number.isFinite(count) && count > 0);
    if (counts.length > 0) return Math.max(...counts);
  }

  const pageObjects = text.match(/\/Type\s*\/Page(?!s)/g);
  return pageObjects?.length ?? 1;
}
