import { OcrServiceError } from "./ocr-errors";
import {
  getOcrFromCache,
  hashFileBuffer,
  setOcrCache,
  truncateRawOcrResponse,
  clearAllOcrCache,
} from "./ocr-cache";
import { getPdfPageCount } from "./compress-pdf-for-ocr";
import { parseOverlayFromRawResponse, buildRawTextFromOverlay } from "./ocr-overlay";
import { saveOriginalToOcrDebug } from "./ocr-debug-storage";
import { logOcrFileIntegrity } from "./original-file-integrity";
import { runGoogleVision } from "./google-vision";
import { logActiveOcrProvider, resolveOcrProvider } from "./ocr-provider";
import {
  assertGoogleVisionHardRequirements,
  isGoogleOnlyMode,
  logOcrProviderActive,
} from "./ocr-hard-verify";
import { prepareOcrInput } from "./prepare-ocr-input";
import { normalizeRtlDocument } from "./rtl-document-normalize";
import { mergeOcrConfidence, ocrNeedsManualReview } from "./ocr-quality";
import type { OcrEngineResult } from "./types";
import type { OcrPositionedLine } from "./ocr-overlay";
import { refineOverlayLines } from "./overlay-line-rebuild";

export type ExtractTextMeta = {
  fileHash?: string;
  route?: string;
  onOcrInputMode?: (mode: "signed_url" | "direct_buffer" | "preprocessed") => void;
  /** מחיקת מטמון לפני סריקה (בדיקות hard verify) */
  clearCacheFirst?: boolean;
};

function normalizeOverlayLines(overlay: OcrPositionedLine[]): OcrPositionedLine[] {
  return overlay.map((line) => ({
    ...line,
    text: normalizeRtlDocument(line.text),
    words: line.words.map((w) => ({
      ...w,
      text: normalizeRtlDocument(w.text),
    })),
  }));
}

export async function extractTextFromDocument(
  buffer: Buffer,
  mimeType: string,
  fileName = "upload",
  meta?: ExtractTextMeta,
): Promise<OcrEngineResult> {
  if (isGoogleOnlyMode()) {
    assertGoogleVisionHardRequirements();
  }

  const provider = logActiveOcrProvider();
  logOcrProviderActive(provider);

  if (meta?.clearCacheFirst || isGoogleOnlyMode()) {
    const cleared = await clearAllOcrCache();
    console.log("[OCR HARD VERIFY] cache cleared rows:", cleared.deletedRows);
  }

  const fileHash = meta?.fileHash ?? hashFileBuffer(buffer);

  logOcrFileIntegrity({
    size: buffer.length,
    mime: mimeType,
    hash: fileHash,
    fileName,
    route: meta?.route,
  });

  let pdfPageCount: number | undefined;
  if (mimeType === "application/pdf") {
    try {
      pdfPageCount = await getPdfPageCount(buffer);
      console.log("[OCR] pdf page count:", pdfPageCount);
    } catch (e) {
      console.warn("[OCR] pdf page count failed:", e);
    }
  }

  const cached = await getOcrFromCache(fileHash, { engineMustBe: "google_vision" });
  if (cached && cached.engine === "google_vision") {
    const overlay = parseOverlayFromRawResponse(cached.rawResponse);
    const normalizedOverlay = refineOverlayLines(normalizeOverlayLines(overlay));
    const text =
      normalizedOverlay.length > 0
        ? buildRawTextFromOverlay(normalizedOverlay)
        : normalizeRtlDocument(cached.rawText);
    const lines =
      normalizedOverlay.length > 0
        ? normalizedOverlay.map((l) => l.text)
        : text.split("\n");
    const confidence = mergeOcrConfidence(cached.confidence, text);
    console.log("OCR PROVIDER ACTIVE: google_vision (cache)");
    return {
      text,
      engine: "google_vision_cache",
      confidence,
      pdfPageCount,
      overlay: normalizedOverlay,
      lines,
      ocrLanguage: "he+ar+en",
      ocrEngine: "google_vision_cache",
      needsManualReview: ocrNeedsManualReview(confidence, text),
      ocrProvider: "google_vision",
      ocrProviderActive: "google_vision",
      fromCache: true,
    };
  }

  await saveOriginalToOcrDebug(buffer, mimeType);
  meta?.onOcrInputMode?.("preprocessed");

  const prepared = await prepareOcrInput(buffer, mimeType, fileName);
  console.log("[OCR PREPARE]", {
    provider: "google_vision",
    inMime: mimeType,
    outMime: prepared.mimeType,
    inBytes: buffer.length,
    outBytes: prepared.buffer.length,
  });

  const ocrStart = Date.now();

  try {
    const gv = await runGoogleVision(prepared.buffer, prepared.mimeType, prepared.fileName);
    const refinedOverlay = refineOverlayLines(gv.overlay);

    console.log("[OCR] recognize duration ms:", Date.now() - ocrStart);
    console.log("OCR PROVIDER ACTIVE: google_vision");
    console.log("[OCR RESPONSE]", {
      confidence: gv.confidence,
      textLength: gv.rawText.length,
      lines: gv.lines.length,
      overlayLines: refinedOverlay.length,
      pageCount: gv.pageCount,
      blockCount: gv.blockCount,
      visionWordsSample: gv.visionWordsSample,
    });

    await setOcrCache(
      fileHash,
      {
        rawText: gv.rawText,
        confidence: gv.confidence,
        engine: "google_vision",
        rawResponse: truncateRawOcrResponse(gv.rawApiResponse),
      },
      { fileName, mimeType },
    );

    return {
      text: gv.rawText,
      engine: "google_vision",
      confidence: gv.confidence,
      pdfPageCount,
      overlay: refinedOverlay,
      lines: gv.lines,
      ocrLanguage: gv.ocrLanguage,
      ocrEngine: gv.ocrEngine,
      needsManualReview: gv.needsManualReview,
      blockCount: gv.blockCount,
      pageCount: gv.pageCount,
      detectedLanguages: gv.detectedLanguages,
      ocrProvider: "google_vision",
      ocrProviderActive: "google_vision",
      rawTextPreview: gv.rawText.slice(0, 2000),
      visionWordsSample: gv.visionWordsSample,
      fromCache: false,
    };
  } catch (e) {
    console.error("[OCR] OCR errors:", e instanceof Error ? e.message : e);
    if (e instanceof OcrServiceError) throw e;
    const msg = e instanceof Error ? e.message : "Google Vision failed";
    throw new OcrServiceError("OCR_PROVIDER_ERROR", msg);
  }
}

export function hasMeaningfulText(text: string): boolean {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length < 8) return false;
  const letters = cleaned.match(/[a-zA-Z\u0590-\u05FF\u0600-\u06FF]/g);
  return (letters?.length ?? 0) >= 6;
}
