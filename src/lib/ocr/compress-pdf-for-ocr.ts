import path from "node:path";
import sharp from "sharp";
import { compressImageBuffer, TARGET_BYTES } from "./compress-image";

const PDF_RENDER_SCALE = process.env.VERCEL ? 2 : 2.5;

async function loadPdfDocument(pdfBuffer: Buffer) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const base = path.join(process.cwd(), "node_modules", "pdfjs-dist");
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(pdfBuffer),
    standardFontDataUrl: path.join(base, `standard_fonts${path.sep}`),
    cMapUrl: path.join(base, `cmaps${path.sep}`),
    cMapPacked: true,
    isEvalSupported: false,
    useSystemFonts: true,
  });
  return loadingTask.promise;
}

/** Page count for UI warnings (multi-page PDF → only page 1 is OCR'd). */
export async function getPdfPageCount(pdfBuffer: Buffer): Promise<number> {
  const pdfDocument = await loadPdfDocument(pdfBuffer);
  try {
    return pdfDocument.numPages;
  } finally {
    await pdfDocument.destroy();
  }
}

/**
 * PDF → render page 1 → JPEG (for OCR.space free tier, ~1MB limit).
 */
export async function renderPdfFirstPageToJpeg(pdfBuffer: Buffer): Promise<Buffer> {
  const { createCanvas } = await import("@napi-rs/canvas");

  console.log("[OCR] pdf-render start bytes:", pdfBuffer.length);

  const pdfDocument = await loadPdfDocument(pdfBuffer);
  try {
    const page = await pdfDocument.getPage(1);
    const viewport = page.getViewport({ scale: PDF_RENDER_SCALE });
    const w = Math.ceil(viewport.width);
    const h = Math.ceil(viewport.height);
    const canvas = createCanvas(w, h);
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("PDF canvas context unavailable");
    }

    await page.render({
      canvasContext: context as unknown as CanvasRenderingContext2D,
      viewport,
      canvas: canvas as unknown as HTMLCanvasElement,
    }).promise;

    const png = await canvas.encode("png");
    const pngBuf = Buffer.from(png);
    console.log("[OCR] pdf-render page1 png bytes:", pngBuf.length);

    let jpeg = await sharp(pngBuf)
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();

    if (jpeg.length > TARGET_BYTES) {
      jpeg = await sharp(pngBuf)
        .resize({ width: 1400, withoutEnlargement: true })
        .jpeg({ quality: 72, mozjpeg: true })
        .toBuffer();
    }

    console.log("[OCR] pdf-render → jpeg bytes:", jpeg.length);
    return jpeg;
  } finally {
    await pdfDocument.destroy();
  }
}

export async function compressPdfForOcr(
  pdfBuffer: Buffer,
  fileName: string,
): Promise<{ buffer: Buffer; mimeType: string; fileName: string; compressed: boolean }> {
  const jpeg = await renderPdfFirstPageToJpeg(pdfBuffer);
  const jpgName = fileName.replace(/\.pdf$/i, "") + "-p1.jpg";

  if (jpeg.length > 900 * 1024) {
    const smaller = await compressImageBuffer(jpeg);
    return {
      buffer: smaller,
      mimeType: "image/jpeg",
      fileName: jpgName,
      compressed: true,
    };
  }

  return {
    buffer: jpeg,
    mimeType: "image/jpeg",
    fileName: jpgName,
    compressed: true,
  };
}
