import crypto from "node:crypto";

export function sha256Buffer(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

/** לוג השוואה LOCAL ↔ PROD — אותו hash = אותו binary */
export function logOcrFileIntegrity(params: {
  size: number;
  mime: string;
  hash: string;
  fileName?: string;
  route?: string;
  debugPath?: string | null;
}): void {
  console.log("[OCR FILE]", params);
}

export function resolveUploadMimeType(file: File): string {
  let mime = (file.type ?? "").trim() || "application/octet-stream";
  const name = file.name ?? "";
  if (mime === "application/octet-stream") {
    if (/\.pdf$/i.test(name)) mime = "application/pdf";
    else if (/\.png$/i.test(name)) mime = "image/png";
    else if (/\.jpe?g$/i.test(name)) mime = "image/jpeg";
  }
  return mime;
}

/** קריאת body יחידה — אין parsing כפול */
export async function bufferFromUploadFile(file: File): Promise<Buffer> {
  return Buffer.from(await file.arrayBuffer());
}
