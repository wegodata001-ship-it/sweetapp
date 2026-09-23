/**
 * Fail-closed Supabase Storage exporter.
 * Does not guess bucket names from code defaults — only ENV and DB fields.
 */
import { createHash } from "node:crypto";
import { CLIENT_MODELS, type FileRefField } from "./catalog";
import type { ExportedModel } from "./prisma-export";

export type StorageStatus =
  | "EXPORTED"
  | "MISSING_SOURCE_FILE"
  | "NOT_ACCESSIBLE"
  | "INVALID_REFERENCE";

export type StorageManifestRow = {
  dbModel: string;
  dbRecordId: string;
  originalPath: string;
  bucket: string;
  exportedPath: string;
  fileName: string;
  size: number | "";
  checksum: string;
  status: StorageStatus;
};

export type StorageDownloadResult =
  | { ok: true; bytes: Uint8Array }
  | { ok: false; reason: "MISSING_SOURCE_FILE" | "NOT_ACCESSIBLE" };

export type StorageDownloader = (bucket: string, path: string) => Promise<StorageDownloadResult>;

export type CollectedFileRef = {
  dbModel: string;
  dbRecordId: string;
  originalPath: string;
  bucket: string;
  fileName: string;
  valid: boolean;
};

const STORAGE_URL_RE = /\/storage\/v1\/object\/(?:public|sign)\/([^/?]+)\/([^?]+)/i;

export function configuredBucketNames(env: NodeJS.ProcessEnv = process.env): string[] {
  const names = [
    env.SUPABASE_STORAGE_BUCKET,
    env.NEXT_PUBLIC_SUPABASE_REPORTS_BUCKET,
    env.WEGO_SOURCE_FILES_BUCKET,
    env.WEGO_DOCUMENTS_BUCKET,
  ]
    .map((v) => v?.trim())
    .filter((v): v is string => Boolean(v));
  return [...new Set(names)];
}

export function reportsBucketFromEnv(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return env.SUPABASE_STORAGE_BUCKET?.trim() || env.NEXT_PUBLIC_SUPABASE_REPORTS_BUCKET?.trim() || undefined;
}

export function sourceBucketFromEnv(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return env.WEGO_SOURCE_FILES_BUCKET?.trim() || env.WEGO_DOCUMENTS_BUCKET?.trim() || undefined;
}

export function storageCredentialsPresent(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.NEXT_PUBLIC_SUPABASE_URL?.trim() && env.SUPABASE_SERVICE_ROLE_KEY?.trim());
}

export function parseStorageUrl(value: string): { bucket?: string; path?: string } {
  const m = value.match(STORAGE_URL_RE);
  if (!m) return {};
  return {
    bucket: decodeURIComponent(m[1]),
    path: decodeURIComponent(m[2]),
  };
}

export function safeFileName(name: string): string {
  const base = name.replace(/\\/g, "/").split("/").pop() ?? "file";
  const cleaned = base.replace(/[<>:"|?*\u0000-\u001f]/g, "_").replace(/^\.+/, "_");
  return cleaned || "file";
}

function resolveRef(
  row: Record<string, unknown>,
  spec: FileRefField,
  env: NodeJS.ProcessEnv,
): { bucket: string; path: string; valid: boolean } {
  const raw = row[spec.pathField];
  if (raw === null || raw === undefined || String(raw).trim() === "") {
    return { bucket: "", path: "", valid: false };
  }
  const value = String(raw).trim();

  if (spec.bucketField) {
    const fromRow = row[spec.bucketField];
    if (typeof fromRow === "string" && fromRow.trim()) {
      return { bucket: fromRow.trim(), path: value, valid: true };
    }
  }

  if (/^https?:\/\//i.test(value)) {
    const parsed = parseStorageUrl(value);
    if (parsed.bucket && parsed.path) {
      return { bucket: parsed.bucket, path: parsed.path, valid: true };
    }
    return { bucket: "", path: value, valid: false };
  }

  const fallback =
    spec.fallbackBucket === "reports"
      ? reportsBucketFromEnv(env)
      : spec.fallbackBucket === "source"
        ? sourceBucketFromEnv(env)
        : undefined;

  if (fallback) {
    return { bucket: fallback, path: value.replace(/^\/+/, ""), valid: true };
  }

  return { bucket: "", path: value, valid: false };
}

export function collectFileRefs(
  models: ExportedModel[],
  env: NodeJS.ProcessEnv = process.env,
): CollectedFileRef[] {
  const refs: CollectedFileRef[] = [];
  for (const { def, rows } of models) {
    if (def.fileRefs.length === 0) continue;
    for (const row of rows) {
      const recordId = String(row[def.idField] ?? "");
      for (const spec of def.fileRefs) {
        const raw = row[spec.pathField];
        if (raw === null || raw === undefined || String(raw).trim() === "") continue;
        const resolved = resolveRef(row, spec, env);
        refs.push({
          dbModel: def.model,
          dbRecordId: recordId,
          originalPath: String(raw),
          bucket: resolved.bucket,
          fileName: safeFileName(resolved.path || String(raw)),
          valid: resolved.valid,
        });
      }
    }
  }
  return refs;
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function exportedStoragePath(bucket: string, path: string): string {
  const safePath = path.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\.\.\//g, "");
  return `STORAGE/files/${bucket}/${safePath}`;
}

export async function exportStorageFiles(
  models: ExportedModel[],
  opts?: {
    env?: NodeJS.ProcessEnv;
    download?: StorageDownloader;
  },
): Promise<{
  files: Map<string, Uint8Array>;
  manifest: StorageManifestRow[];
  credentialsPresent: boolean;
}> {
  const env = opts?.env ?? process.env;
  const creds = storageCredentialsPresent(env);
  const refs = collectFileRefs(models, env);
  const files = new Map<string, Uint8Array>();
  const manifest: StorageManifestRow[] = [];

  if (!creds || !opts?.download) {
    for (const ref of refs) {
      manifest.push({
        dbModel: ref.dbModel,
        dbRecordId: ref.dbRecordId,
        originalPath: ref.originalPath,
        bucket: ref.bucket,
        exportedPath: "",
        fileName: ref.fileName,
        size: "",
        checksum: "",
        status: ref.valid ? "NOT_ACCESSIBLE" : "INVALID_REFERENCE",
      });
    }
    return { files, manifest, credentialsPresent: creds };
  }

  const seen = new Map<string, { exportedPath: string; checksum: string; size: number }>();

  for (const ref of refs) {
    if (!ref.valid || !ref.bucket) {
      manifest.push({
        dbModel: ref.dbModel,
        dbRecordId: ref.dbRecordId,
        originalPath: ref.originalPath,
        bucket: ref.bucket,
        exportedPath: "",
        fileName: ref.fileName,
        size: "",
        checksum: "",
        status: "INVALID_REFERENCE",
      });
      continue;
    }

    const parsed = /^https?:\/\//i.test(ref.originalPath)
      ? parseStorageUrl(ref.originalPath)
      : { path: ref.originalPath.replace(/^\/+/, "") };
    const objectPath = parsed.path ?? ref.originalPath.replace(/^\/+/, "");
    const cacheKey = `${ref.bucket}::${objectPath}`;
    const cached = seen.get(cacheKey);
    if (cached) {
      manifest.push({
        dbModel: ref.dbModel,
        dbRecordId: ref.dbRecordId,
        originalPath: ref.originalPath,
        bucket: ref.bucket,
        exportedPath: cached.exportedPath,
        fileName: ref.fileName,
        size: cached.size,
        checksum: cached.checksum,
        status: "EXPORTED",
      });
      continue;
    }

    const result = await opts.download(ref.bucket, objectPath);
    if (!result.ok) {
      manifest.push({
        dbModel: ref.dbModel,
        dbRecordId: ref.dbRecordId,
        originalPath: ref.originalPath,
        bucket: ref.bucket,
        exportedPath: "",
        fileName: ref.fileName,
        size: "",
        checksum: "",
        status: result.reason === "MISSING_SOURCE_FILE" ? "MISSING_SOURCE_FILE" : "NOT_ACCESSIBLE",
      });
      continue;
    }

    const checksum = sha256Hex(result.bytes);
    const exportedPath = exportedStoragePath(ref.bucket, objectPath);
    files.set(exportedPath, result.bytes);
    seen.set(cacheKey, { exportedPath, checksum, size: result.bytes.byteLength });
    manifest.push({
      dbModel: ref.dbModel,
      dbRecordId: ref.dbRecordId,
      originalPath: ref.originalPath,
      bucket: ref.bucket,
      exportedPath,
      fileName: ref.fileName,
      size: result.bytes.byteLength,
      checksum,
      status: "EXPORTED",
    });
  }

  return { files, manifest, credentialsPresent: creds };
}

export function storageSummary(manifest: StorageManifestRow[]): {
  referenced: number;
  exported: number;
  missing: number;
  notAccessible: number;
  invalid: number;
} {
  return {
    referenced: manifest.length,
    exported: manifest.filter((r) => r.status === "EXPORTED").length,
    missing: manifest.filter((r) => r.status === "MISSING_SOURCE_FILE").length,
    notAccessible: manifest.filter((r) => r.status === "NOT_ACCESSIBLE").length,
    invalid: manifest.filter((r) => r.status === "INVALID_REFERENCE").length,
  };
}

export function modelsWithFileRefs(): string[] {
  return CLIENT_MODELS.filter((m) => m.fileRefs.length > 0).map((m) => m.model);
}
