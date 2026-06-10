import JSZip from "jszip";
import type { AccountantEmailAttachment } from "@/lib/finance/accountant-email";

export const EMAIL_ATTACHMENT_ZIP_THRESHOLD_BYTES = 25 * 1024 * 1024;

export function totalAttachmentBytes(files: AccountantEmailAttachment[]): number {
  return files.reduce((sum, f) => sum + f.buffer.length, 0);
}

function uniqueFileName(base: string, used: Set<string>): string {
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const ext = dot > 0 ? base.slice(dot) : "";
  let i = 2;
  while (used.has(`${stem}_${i}${ext}`)) i += 1;
  const name = `${stem}_${i}${ext}`;
  used.add(name);
  return name;
}

export function buildDocumentsZipFileName(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `documents_${y}_${m}.zip`;
}

export async function zipDocumentAttachments(
  files: AccountantEmailAttachment[],
): Promise<{ buffer: Buffer; fileName: string }> {
  const zip = new JSZip();
  const used = new Set<string>();
  for (const file of files) {
    zip.file(uniqueFileName(file.fileName, used), file.buffer);
  }
  const buffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
  return { buffer, fileName: buildDocumentsZipFileName() };
}

export function shouldZipAttachments(files: AccountantEmailAttachment[]): boolean {
  return totalAttachmentBytes(files) >= EMAIL_ATTACHMENT_ZIP_THRESHOLD_BYTES;
}
