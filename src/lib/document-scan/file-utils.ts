import crypto from "node:crypto";
import { resolveUploadMimeType, isPdfMimeType } from "./upload-mime";

export const SUPPORTED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/jpg",
  "image/webp",
  "application/pdf",
] as const;

export {
  resolveUploadMimeType,
  isPdfMimeType,
  isPdfFile,
  SCAN_ACCEPT_MIME,
  estimatePdfPageCount,
} from "./upload-mime";

export function isSupportedMimeType(m: string): boolean {
  return (SUPPORTED_MIME_TYPES as readonly string[]).includes(m);
}

export function hashFileBuffer(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

export async function bufferFromUploadFile(file: File): Promise<Buffer> {
  return Buffer.from(await file.arrayBuffer());
}
