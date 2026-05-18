import sharp from "sharp";
import { extractOcrRegions } from "./ocr-regions";
import { rasterizePdfPage1 } from "./pdf-rasterize";
import { getSharedOcrWorker } from "./tesseract-worker";
import { timeStep } from "./timing";
import type { OcrEngineResult } from "./types";

/** Fixed width — smaller = faster recognize on Vercel. */
const OCR_MAX_WIDTH = 1200;

type PreprocessOpts = {
  /** trim() is slow — skip for camera uploads / PNG */
  trim?: boolean;
};

/**
 * Optimize before Tesseract: resize + grayscale + normalize (+ optional trim).
 */
export async function preprocessForOcr(
  buffer: Buffer,
  opts: PreprocessOpts = {},
): Promise<Buffer> {
  let img = sharp(buffer).rotate();
  if (opts.trim) {
    try {
      img = sharp(await img.trim({ threshold: 14 }).toBuffer());
    } catch {
      /* keep original */
    }
  }
  return img
    .grayscale()
    .normalize()
    .resize({ width: OCR_MAX_WIDTH, withoutEnlargement: true })
    .png({ compressionLevel: 6 })
    .toBuffer();
}

async function recognizeRegions(
  preprocessed: Buffer,
  engine: string,
): Promise<OcrEngineResult> {
  const regions = await extractOcrRegions(preprocessed);
  const worker = await getSharedOcrWorker();

  const parts: string[] = [];
  let confSum = 0;
  let confN = 0;

  for (const { id, buffer } of regions) {
    const recognizeStart = Date.now();
    const { data } = await worker.recognize(buffer);
    const recognizeMs = Date.now() - recognizeStart;
    console.log(`[OCR] ocr recognize time (${id}): ${recognizeMs}ms`);

    const chunk = (data.text ?? "").trim();
    if (chunk) {
      parts.push(chunk);
      console.log(`[OCR] region ${id} preview:`, chunk.slice(0, 180));
    }
    if (typeof data.confidence === "number" && data.confidence > 0) {
      confSum += data.confidence;
      confN += 1;
    }
  }

  const text = parts.join("\n\n");
  if (text.length > 0) {
    console.log("[OCR] OCR TEXT preview (merged):", text.slice(0, 400));
  }

  const confidence =
    confN > 0
      ? Math.min(1, confSum / confN / 100)
      : text
        ? 0.72
        : 0;

  return { text, engine, confidence };
}

async function runRegionalOcr(
  imageBuffer: Buffer,
  opts: { alreadyPreprocessed?: boolean; engine?: string } = {},
): Promise<OcrEngineResult> {
  const preprocessed = opts.alreadyPreprocessed
    ? imageBuffer
    : await timeStep("ocr:sharp", () => preprocessForOcr(imageBuffer, { trim: false }));

  return timeStep("ocr:ocr", () =>
    recognizeRegions(preprocessed, opts.engine ?? "tesseract"),
  );
}

async function ocrFromRasterizedPdf(pdfBuffer: Buffer): Promise<OcrEngineResult> {
  const raster = await timeStep("ocr:pdf-render", () => rasterizePdfPage1(pdfBuffer));
  if (!raster) {
    console.error("[OCR] PDF CONVERT FAILED");
    return { text: "", engine: "tesseract_pdf", confidence: 0 };
  }
  const preprocessed = await timeStep("ocr:sharp", () =>
    preprocessForOcr(raster, { trim: true }),
  );
  return runRegionalOcr(preprocessed, {
    alreadyPreprocessed: true,
    engine: "tesseract_pdf",
  });
}

/**
 * PDF → rasterize → sharp → regional OCR.
 * Image → sharp → regional OCR (never PDF pipeline).
 */
export async function extractTextFromDocument(
  buffer: Buffer,
  mimeType: string,
): Promise<OcrEngineResult> {
  if (mimeType === "application/pdf") {
    return ocrFromRasterizedPdf(buffer);
  }

  if (mimeType.startsWith("image/")) {
    console.log("[OCR] IMAGE pipeline (sharp → regions, skip pdf-render)");
    const preprocessed = await timeStep("ocr:sharp", () =>
      preprocessForOcr(buffer, { trim: false }),
    );
    return runRegionalOcr(preprocessed, { alreadyPreprocessed: true });
  }

  return { text: "", engine: "unsupported", confidence: 0 };
}

export function hasMeaningfulText(text: string): boolean {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length < 8) return false;
  const letters = cleaned.match(/[a-zA-Z\u0590-\u05FF\u0600-\u06FF]/g);
  return (letters?.length ?? 0) >= 6;
}
