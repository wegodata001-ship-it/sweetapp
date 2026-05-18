import sharp from "sharp";
import { cropInvoiceArea, rasterizePdfPage1 } from "./pdf-rasterize";
import type { OcrEngineResult } from "./types";

/** Mandatory preprocessing before Tesseract (Hebrew / Arabic invoices). */
export async function preprocessForOcr(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .rotate()
    .grayscale()
    .normalize()
    .sharpen()
    .resize({ width: 2200, withoutEnlargement: false })
    .png()
    .toBuffer();
}

async function runTesseractOnImage(imageBuffer: Buffer): Promise<OcrEngineResult> {
  console.log("[OCR] Tesseract — preprocessing image");
  const preprocessed = await preprocessForOcr(imageBuffer);
  console.log("[OCR] Preprocessed image bytes:", preprocessed.length);

  const { createWorker, PSM } = await import("tesseract.js");
  let worker;
  try {
    worker = await createWorker("heb+eng+ara", 1, {
      logger: () => undefined,
    });
  } catch (e) {
    console.error("[OCR] Tesseract worker create failed:", e);
    throw new Error("OCR engine failed to start (tesseract.js)");
  }
  try {
    await worker.setParameters({
      preserve_interword_spaces: "1",
      tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
      tessedit_do_invert: "0",
    });
    console.log("[OCR] RTL mode: heb+eng+ara, PSM=6, preserve_interword_spaces=1");
    const { data } = await worker.recognize(preprocessed);
    const text = (data.text ?? "").trim();
    console.log("[OCR] OCR raw result length:", text.length);
    if (text.length > 0) {
      console.log("[OCR] OCR raw result preview:", text.slice(0, 500));
    }
    const confidence =
      typeof data.confidence === "number" && data.confidence > 0
        ? Math.min(1, data.confidence / 100)
        : text
          ? 0.72
          : 0;
    return { text, engine: "tesseract", confidence };
  } catch (e) {
    console.error("[OCR] Tesseract recognize failed:", e);
    throw e instanceof Error ? e : new Error("OCR recognition failed");
  } finally {
    await worker.terminate();
  }
}

async function ocrFromRasterizedPdf(pdfBuffer: Buffer): Promise<OcrEngineResult> {
  console.log("[OCR] PDF pipeline → rasterize page 1 (pdfjs+canvas)");
  const raster = await rasterizePdfPage1(pdfBuffer);
  if (!raster) {
    console.error("[OCR] PDF CONVERT FAILED — no image buffer");
    return { text: "", engine: "tesseract_pdf", confidence: 0 };
  }
  console.log("[OCR] PDF CONVERT SUCCESS, raster bytes:", raster.length);
  const cropped = await cropInvoiceArea(raster);
  console.log("[OCR] Cropped invoice image bytes:", cropped.length);
  const result = await runTesseractOnImage(cropped);
  return { ...result, engine: "tesseract_pdf" };
}

/**
 * PDF: ONLY image pipeline (no pdf-parse / viewer text).
 * Image: preprocess → tesseract.
 */
export async function extractTextFromDocument(
  buffer: Buffer,
  mimeType: string,
): Promise<OcrEngineResult> {
  if (mimeType === "application/pdf") {
    return ocrFromRasterizedPdf(buffer);
  }

  if (mimeType.startsWith("image/")) {
    console.log("[OCR] IMAGE pipeline (no PDF conversion)");
    const cropped = await cropInvoiceArea(buffer);
    return runTesseractOnImage(cropped);
  }

  return { text: "", engine: "unsupported", confidence: 0 };
}

export function hasMeaningfulText(text: string): boolean {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length < 8) return false;
  const letters = cleaned.match(/[a-zA-Z\u0590-\u05FF\u0600-\u06FF]/g);
  return (letters?.length ?? 0) >= 6;
}
