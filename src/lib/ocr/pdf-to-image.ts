import path from "node:path";
import sharp from "sharp";

const PDF_RENDER_SCALE = process.env.VERCEL ? 2.2 : 2.5;

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

/** PDF עמוד 1 → PNG באיכות גבוהה ל־Google Vision */
export async function renderPdfFirstPageToPng(pdfBuffer: Buffer): Promise<Buffer> {
  const { createCanvas } = await import("@napi-rs/canvas");

  const pdfDocument = await loadPdfDocument(pdfBuffer);
  try {
    const page = await pdfDocument.getPage(1);
    const viewport = page.getViewport({ scale: PDF_RENDER_SCALE });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("PDF canvas context unavailable");

    await page.render({
      canvasContext: context as unknown as CanvasRenderingContext2D,
      viewport,
      canvas: canvas as unknown as HTMLCanvasElement,
    }).promise;

    const png = await canvas.encode("png");
    return Buffer.from(png);
  } finally {
    await pdfDocument.destroy();
  }
}

