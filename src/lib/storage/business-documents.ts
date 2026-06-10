import { randomUUID } from "crypto";
import {
  createSignedStorageUrl,
  getSupabaseServiceClient,
} from "@/lib/supabase/server";
import {
  assertBucketExists,
  normalizeStorageError,
  resolveSourceFilesBucket,
  sourceFilesBucketName,
  STORAGE_BUCKET_MISSING,
} from "@/lib/storage/buckets";

/** Document categories under tenant folder — income | expense | ocr | zreport */
export type BusinessDocumentCategory = "income" | "expense" | "ocr" | "zreport";

export type UploadedBusinessDocument = {
  bucket: string;
  storagePath: string;
  fileName: string;
  fileType: string;
  /** Short-lived signed URL for immediate preview after upload */
  viewUrl: string | null;
};

const DEFAULT_SIGNED_URL_TTL_SEC = 3600;

export { sourceFilesBucketName as businessDocumentsBucket };

/** Tenant prefix in storage paths, e.g. TEN_12345 */
export function tenantStorageId(): string {
  const raw =
    process.env.WEGO_TENANT_ID?.trim() ||
    process.env.WEGO_COMPANY_ID?.trim() ||
    "default";
  if (raw.startsWith("TEN_")) return raw;
  return `TEN_${raw}`;
}

function sanitizeFileName(fileName: string): string {
  const base = fileName.replace(/[\\/]+/g, "-").replace(/[^A-Za-z0-9._\-]+/g, "_");
  const trimmed = base.replace(/^_+|_+$/g, "").replace(/_+/g, "_");
  return trimmed.slice(0, 80) || "";
}

function inferFileExtension(fileName: string, contentType?: string): string {
  const fromName = fileName.match(/(\.[a-z0-9]{1,8})$/i)?.[1]?.toLowerCase();
  if (fromName) return fromName;
  const mime = (contentType ?? "").toLowerCase();
  if (mime === "application/pdf") return ".pdf";
  if (mime === "image/jpeg" || mime === "image/jpg") return ".jpg";
  if (mime === "image/png") return ".png";
  if (mime === "image/webp") return ".webp";
  return ".bin";
}

/** שם קובץ ייחודי — אסור להשתמש בשם קבוע (למשל _.pdf) */
export function buildUniqueStorageFileName(fileName: string, contentType?: string): string {
  const ext = inferFileExtension(fileName, contentType);
  const safe = sanitizeFileName(fileName.replace(/\.[^.]+$/, "")) || "scan";
  return `${Date.now()}-${randomUUID()}-${safe}${ext}`;
}

export function isStorageResourceExistsError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("already exists") ||
    m.includes("resource already exists") ||
    m.includes("duplicate") ||
    m.includes("409")
  );
}

function yearMonthParts(date = new Date()): { year: string; month: string } {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return { year, month };
}

/** pdf_photo/{tenant}/{category}/{yyyy}/{MM}/{uniqueFileName} */
export function buildBusinessDocumentPath(params: {
  category: BusinessDocumentCategory;
  fileName: string;
  contentType?: string;
  date?: Date;
}): string {
  const { year, month } = yearMonthParts(params.date);
  const uniqueFileName = buildUniqueStorageFileName(params.fileName, params.contentType);
  return `${tenantStorageId()}/${params.category}/${year}/${month}/${uniqueFileName}`;
}

export async function uploadBusinessDocument(params: {
  buffer: Buffer;
  fileName: string;
  contentType: string;
  category: BusinessDocumentCategory;
  date?: Date;
}): Promise<UploadedBusinessDocument> {
  const supabase = getSupabaseServiceClient();
  if (!supabase) {
    throw new Error("Supabase לא מוגדר — NEXT_PUBLIC_SUPABASE_URL ו-SUPABASE_SERVICE_ROLE_KEY");
  }

  const bucket = sourceFilesBucketName();
  await assertBucketExists(bucket);

  const storagePath = buildBusinessDocumentPath({
    category: params.category,
    fileName: params.fileName,
    contentType: params.contentType,
    date: params.date,
  });
  const fileType = params.contentType.trim() || "application/octet-stream";
  const displayName = sanitizeFileName(params.fileName) || buildUniqueStorageFileName(params.fileName, params.contentType);

  try {
    const { error } = await supabase.storage.from(bucket).upload(storagePath, params.buffer, {
      contentType: fileType,
      cacheControl: "3600",
      upsert: false,
    });
    if (error) {
      const msg = normalizeStorageError(error.message);
      if (isStorageResourceExistsError(msg)) {
        console.warn("[uploadBusinessDocument] resource already exists — skipping upload", {
          bucket,
          storagePath,
        });
        throw new StorageResourceExistsError(msg, storagePath);
      }
      console.error("[uploadBusinessDocument] supabase error", msg, { bucket, storagePath });
      throw new Error(msg);
    }

    const viewUrl = await createSignedStorageUrl(bucket, storagePath, DEFAULT_SIGNED_URL_TTL_SEC);
    return {
      bucket,
      storagePath,
      fileName: displayName,
      fileType,
      viewUrl,
    };
  } catch (e) {
    if (e instanceof StorageResourceExistsError) throw e;
    const msg = normalizeStorageError(e instanceof Error ? e.message : String(e));
    console.error("[uploadBusinessDocument] failed", msg, { bucket });
    throw new Error(msg);
  }
}

/** Supabase 409 / object already exists — non-fatal for scan pipeline */
export class StorageResourceExistsError extends Error {
  readonly storagePath: string;

  constructor(message: string, storagePath: string) {
    super(message);
    this.name = "StorageResourceExistsError";
    this.storagePath = storagePath;
  }
}

export async function getBusinessDocumentSignedUrl(
  storagePath: string,
  bucket?: string,
  expiresInSec = DEFAULT_SIGNED_URL_TTL_SEC,
): Promise<string | null> {
  const resolved = resolveSourceFilesBucket(bucket);
  return createSignedStorageUrl(resolved, storagePath, expiresInSec);
}

export { STORAGE_BUCKET_MISSING };
