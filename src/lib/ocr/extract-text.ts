import { compressForOcr } from "./compress-for-ocr";
import { OcrServiceError } from "./ocr-errors";
import { getOcrFromCache, hashFileBuffer, setOcrCache } from "./ocr-cache";
import { ocrSpaceConfigured, runOcrSpace } from "./ocr-space";
import type { OcrEngineResult } from "./types";

/**
 * OCR via OCR.space API (with sha256 cache + PDF→JPEG compression).
 */
export async function extractTextFromDocument(
  buffer: Buffer,
  mimeType: string,
  fileName = "upload",
): Promise<OcrEngineResult> {
  if (!ocrSpaceConfigured()) {
    console.warn("[OCR] OCR_SPACE_API_KEY missing");
    return { text: "", engine: "ocr_space", confidence: 0 };
  }

  const fileHash = hashFileBuffer(buffer);
  const cached = await getOcrFromCache(fileHash);
  if (cached) {
    return {
      text: cached.rawText,
      engine: `${cached.engine}_cache`,
      confidence: cached.confidence,
    };
  }

  const compressed = await compressForOcr(buffer, mimeType, fileName);
  const ocrStart = Date.now();

  try {
    const { rawText, confidence } = await runOcrSpace(
      compressed.buffer,
      compressed.mimeType,
      compressed.fileName,
    );
    console.log("[OCR] OCR recognize duration ms:", Date.now() - ocrStart);

    await setOcrCache(
      fileHash,
      { rawText, confidence, engine: "ocr_space" },
      { fileName, mimeType },
    );

    return {
      text: rawText,
      engine: "ocr_space",
      confidence,
    };
  } catch (e) {
    console.error("[OCR] OCR errors:", e instanceof Error ? e.message : e);
    if (e instanceof OcrServiceError) throw e;
    const msg = e instanceof Error ? e.message : "OCR.space failed";
    throw new OcrServiceError("OCR_PROVIDER_ERROR", msg);
  }
}

export function hasMeaningfulText(text: string): boolean {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length < 8) return false;
  const letters = cleaned.match(/[a-zA-Z\u0590-\u05FF\u0600-\u06FF]/g);
  return (letters?.length ?? 0) >= 6;
}
