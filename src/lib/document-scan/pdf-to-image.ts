import path from "node:path";
import { preprocessImageForScan } from "./preprocess-image";

const PDF_RENDER_SCALE = process.env.VERCEL ? 2.2 : 2.5;
export const PDF_MAX_SCAN_PAGES = 20;

export function isPdfBuffer(buffer: Buffer): boolean {
  return buffer.length >= 4 && buffer.subarray(0, 4).toString("utf8") === "%PDF";
}

function pdfJsAssetUrl(...segments: string[]): string {
  return `${path.join(...segments).replace(/\\/g, "/")}/`;
}

async function loadPdfDocument(pdfBuffer: Buffer) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const base = path.join(process.cwd(), "node_modules", "pdfjs-dist");
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(pdfBuffer),
    standardFontDataUrl: pdfJsAssetUrl(base, "standard_fonts"),
    cMapUrl: pdfJsAssetUrl(base, "cmaps"),
    cMapPacked: true,
    isEvalSupported: false,
    useSystemFonts: true,
  });
  return loadingTask.promise;
}

export async function getPdfPageCount(pdfBuffer: Buffer): Promise<number> {
  if (!isPdfBuffer(pdfBuffer)) return 0;
  const pdfDocument = await loadPdfDocument(pdfBuffer);
  try {
    return pdfDocument.numPages;
  } finally {
    await pdfDocument.destroy();
  }
}

async function renderPdfPageToPng(pdfBuffer: Buffer, pageNumber: number): Promise<Buffer> {
  const { createCanvas } = await import("@napi-rs/canvas");
  const pdfDocument = await loadPdfDocument(pdfBuffer);
  try {
    const page = await pdfDocument.getPage(pageNumber);
    const viewport = page.getViewport({ scale: PDF_RENDER_SCALE });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("PDF canvas context unavailable");

    await page.render({
      canvasContext: context as unknown as CanvasRenderingContext2D,
      viewport,
      canvas: canvas as unknown as HTMLCanvasElement,
    }).promise;

    return Buffer.from(await canvas.encode("png"));
  } finally {
    await pdfDocument.destroy();
  }
}

/** PDF עמוד בודד → JPEG מוכן ל-Gemini */
export async function renderPdfPageForScan(
  pdfBuffer: Buffer,
  pageNumber: number,
): Promise<{ buffer: Buffer; mimeType: string; pageNumber: number }> {
  const png = await renderPdfPageToPng(pdfBuffer, pageNumber);
  const processed = await preprocessImageForScan(png, "image/png");
  return {
    buffer: processed.buffer,
    mimeType: processed.mimeType,
    pageNumber,
  };
}

/** כל עמודי PDF → JPEG (עד PDF_MAX_SCAN_PAGES) */
export async function renderAllPdfPagesForScan(
  pdfBuffer: Buffer,
  maxPages = PDF_MAX_SCAN_PAGES,
): Promise<Array<{ buffer: Buffer; mimeType: string; pageNumber: number }>> {
  const totalPages = await getPdfPageCount(pdfBuffer);
  if (totalPages === 0) throw new Error("PDF has no pages");

  const limit = Math.min(totalPages, maxPages);
  const pages: Array<{ buffer: Buffer; mimeType: string; pageNumber: number }> = [];
  for (let pageNumber = 1; pageNumber <= limit; pageNumber++) {
    pages.push(await renderPdfPageForScan(pdfBuffer, pageNumber));
  }
  return pages;
}

/** @deprecated use renderPdfPageForScan */
export async function renderPdfFirstPageToPng(pdfBuffer: Buffer): Promise<Buffer> {
  return renderPdfPageToPng(pdfBuffer, 1);
}
