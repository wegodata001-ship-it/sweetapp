import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";

export type ScanCacheKind = "invoice" | "zreport";

/** מפתח cache — hash של הקובץ + סוג סריקה + מצב קליטה */
export function scanCacheKey(
  fileHash: string,
  kind: ScanCacheKind,
  intakeMode: "quick" | "full" = "quick",
): string {
  return createHash("sha256")
    .update(`${fileHash}:${kind}:${intakeMode}`)
    .digest("hex");
}

function cacheEngine(kind: ScanCacheKind, intakeMode: "quick" | "full"): string {
  return kind === "zreport" ? "gemini_z_report" : `gemini_invoice_${intakeMode}`;
}

export async function getScanCache<T>(cacheKey: string): Promise<T | null> {
  try {
    const row = await prisma.ocrCache.findUnique({ where: { fileHash: cacheKey } });
    if (!row?.rawText?.trim()) return null;
    const payload = JSON.parse(row.rawText) as T;
    void prisma.ocrCache
      .update({ where: { fileHash: cacheKey }, data: { lastUsedAt: new Date() } })
      .catch(() => undefined);
    console.log("[SCAN_CACHE_HIT]", { cacheKey, engine: row.engine });
    return payload;
  } catch (e) {
    console.warn("[SCAN_CACHE_READ_FAILED]", e instanceof Error ? e.message : e);
    return null;
  }
}

export async function saveScanCache(params: {
  cacheKey: string;
  kind: ScanCacheKind;
  intakeMode?: "quick" | "full";
  fileName?: string;
  mimeType?: string;
  payload: unknown;
  confidence: number;
  rawResponse?: string;
}): Promise<void> {
  try {
    const rawText = JSON.stringify(params.payload);
    await prisma.ocrCache.upsert({
      where: { fileHash: params.cacheKey },
      create: {
        fileHash: params.cacheKey,
        engine: cacheEngine(params.kind, params.intakeMode ?? "quick"),
        rawText,
        rawResponse: params.rawResponse?.slice(0, 8000) ?? null,
        confidence: params.confidence,
        fileName: params.fileName ?? null,
        mimeType: params.mimeType ?? null,
      },
      update: {
        engine: cacheEngine(params.kind, params.intakeMode ?? "quick"),
        rawText,
        rawResponse: params.rawResponse?.slice(0, 8000) ?? null,
        confidence: params.confidence,
        fileName: params.fileName ?? null,
        mimeType: params.mimeType ?? null,
        lastUsedAt: new Date(),
      },
    });
    console.log("[SCAN_CACHE_SAVE]", { cacheKey: params.cacheKey });
  } catch (e) {
    console.warn("[SCAN_CACHE_SAVE_FAILED]", e instanceof Error ? e.message : e);
  }
}
