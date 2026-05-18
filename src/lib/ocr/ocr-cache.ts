import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";

const MAX_RAW_RESPONSE_CHARS = 32_000;

export type OcrCachePayload = {
  rawText: string;
  confidence: number;
  engine: string;
  rawResponse?: string | null;
};

export function truncateRawOcrResponse(body: string | null | undefined): string | null {
  if (!body?.trim()) return null;
  if (body.length <= MAX_RAW_RESPONSE_CHARS) return body;
  return `${body.slice(0, MAX_RAW_RESPONSE_CHARS)}\n…[truncated]`;
}

type CacheGlobals = typeof globalThis & {
  __wegoOcrCacheMem?: Map<string, OcrCachePayload>;
};

const g = globalThis as CacheGlobals;

export function hashFileBuffer(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function memoryGet(hash: string): OcrCachePayload | null {
  return g.__wegoOcrCacheMem?.get(hash) ?? null;
}

function memorySet(hash: string, payload: OcrCachePayload): void {
  if (!g.__wegoOcrCacheMem) g.__wegoOcrCacheMem = new Map();
  if (g.__wegoOcrCacheMem.size > 200) {
    const first = g.__wegoOcrCacheMem.keys().next().value;
    if (first) g.__wegoOcrCacheMem.delete(first);
  }
  g.__wegoOcrCacheMem.set(hash, payload);
}

/**
 * Lookup OCR result by SHA-256 of original file bytes.
 */
export async function getOcrFromCache(fileHash: string): Promise<OcrCachePayload | null> {
  const mem = memoryGet(fileHash);
  if (mem) {
    console.log("[OCR] ocr_cache hit (memory)", fileHash.slice(0, 12));
    return mem;
  }

  try {
    const row = await prisma.ocrCache.findUnique({
      where: { fileHash },
    });
    if (!row) return null;

    await prisma.ocrCache.update({
      where: { fileHash },
      data: { lastUsedAt: new Date() },
    });

    const payload: OcrCachePayload = {
      rawText: row.rawText,
      confidence: row.confidence,
      engine: row.engine,
      rawResponse: row.rawResponse,
    };
    memorySet(fileHash, payload);
    console.log("[OCR] ocr_cache hit (db)", fileHash.slice(0, 12));
    return payload;
  } catch (e) {
    console.warn("[OCR] ocr_cache read skipped (run migration?):", e);
    return null;
  }
}

export async function setOcrCache(
  fileHash: string,
  payload: OcrCachePayload,
  meta?: { fileName?: string; mimeType?: string },
): Promise<void> {
  memorySet(fileHash, payload);

  try {
    await prisma.ocrCache.upsert({
      where: { fileHash },
      create: {
        fileHash,
        rawText: payload.rawText,
        rawResponse: payload.rawResponse ?? null,
        confidence: payload.confidence,
        engine: payload.engine,
        fileName: meta?.fileName ?? null,
        mimeType: meta?.mimeType ?? null,
      },
      update: {
        rawText: payload.rawText,
        rawResponse: payload.rawResponse ?? null,
        confidence: payload.confidence,
        engine: payload.engine,
        fileName: meta?.fileName ?? null,
        mimeType: meta?.mimeType ?? null,
        lastUsedAt: new Date(),
      },
    });
    console.log("[OCR] ocr_cache stored", fileHash.slice(0, 12));
  } catch (e) {
    console.warn("[OCR] ocr_cache write skipped:", e);
  }
}
