import sharp from "sharp";
import { rasterizePdfPage1 } from "./pdf-rasterize";
import { getSharedOcrWorker } from "./tesseract-worker";
import { timeStep } from "./timing";
import type { OcrEngineResult } from "./types";

/** Smaller on Vercel — faster OCR, still readable for Hebrew invoices. */
const OCR_MAX_WIDTH = process.env.VERCEL ? 1400 : 2200;

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

async function runTesseractOnImage(
  imageBuffer: Buffer,
  opts: { alreadyPreprocessed?: boolean } = {},
): Promise<OcrEngineResult> {
  const preprocessed = opts.alreadyPreprocessed
    ? imageBuffer
    : await timeStep("ocr:sharp", () => preprocessForOcr(imageBuffer, { trim: false }));

  return timeStep("ocr:ocr", async () => {
    const worker = await getSharedOcrWorker();
    const { data } = await worker.recognize(preprocessed);
    const text = (data.text ?? "").trim();
    if (text.length > 0) {
      console.log("[OCR] OCR TEXT preview:", text.slice(0, 400));
    }
    const confidence =
      typeof data.confidence === "number" && data.confidence > 0
        ? Math.min(1, data.confidence / 100)
        : text
          ? 0.72
          : 0;
    return { text, engine: "tesseract", confidence };
  });
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
  const result = await runTesseractOnImage(preprocessed, { alreadyPreprocessed: true });
  return { ...result, engine: "tesseract_pdf" };
}

/**
 * PDF → rasterize → sharp. Image → sharp only (never PDF pipeline).
 */
export async function extractTextFromDocument(
  buffer: Buffer,
  mimeType: string,
): Promise<OcrEngineResult> {
  if (mimeType === "application/pdf") {
    return ocrFromRasterizedPdf(buffer);
  }

  if (mimeType.startsWith("image/")) {
    console.log("[OCR] IMAGE pipeline (skip pdf-render)");
    const preprocessed = await timeStep("ocr:sharp", () =>
      preprocessForOcr(buffer, { trim: false }),
    );
    return runTesseractOnImage(preprocessed, { alreadyPreprocessed: true });
  }

  return { text: "", engine: "unsupported", confidence: 0 };
}

export function hasMeaningfulText(text: string): boolean {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length < 8) return false;
  const letters = cleaned.match(/[a-zA-Z\u0590-\u05FF\u0600-\u06FF]/g);
  return (letters?.length ?? 0) >= 6;
}
