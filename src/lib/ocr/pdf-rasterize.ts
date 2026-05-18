import path from "node:path";
import sharp from "sharp";

/** Lower scale on Vercel = faster PDF render */
const PDF_RENDER_SCALE = process.env.VERCEL ? 2 : 3;
const RASTER_WIDTH = 1200;

/**
 * PDF page 1 → PNG (serverless-safe: pdfjs-dist + @napi-rs/canvas).
 * No poppler / pdf2pic — works on Vercel.
 */
export async function rasterizePdfPage1(pdfBuffer: Buffer): Promise<Buffer | null> {
  const fromPdfJs = await rasterizeWithPdfJsCanvas(pdfBuffer);
  if (fromPdfJs) return fromPdfJs;

  const fromPdfToImg = await tryPdfToImg(pdfBuffer);
  if (fromPdfToImg) return fromPdfToImg;

  console.error("[pdf-rasterize] All PDF→image converters failed");
  return null;
}

/** Trim margins so OCR focuses on invoice content. */
export async function cropInvoiceArea(imageBuffer: Buffer): Promise<Buffer> {
  try {
    return await sharp(imageBuffer)
      .trim({ threshold: 12 })
      .resize({ width: RASTER_WIDTH, withoutEnlargement: false })
      .png()
      .toBuffer();
  } catch {
    return imageBuffer;
  }
}

function pdfJsAssetBase(): string {
  return path.join(process.cwd(), "node_modules", "pdfjs-dist");
}

/** Primary: pdfjs render → @napi-rs/canvas → PNG buffer. */
async function rasterizeWithPdfJsCanvas(pdfBuffer: Buffer): Promise<Buffer | null> {
  try {
    const { createCanvas } = await import("@napi-rs/canvas");
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const base = pdfJsAssetBase();

    console.log("[pdf-rasterize] pdfjs+canvas start, pdf bytes:", pdfBuffer.length);

    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(pdfBuffer),
      standardFontDataUrl: path.join(base, `standard_fonts${path.sep}`),
      cMapUrl: path.join(base, `cmaps${path.sep}`),
      cMapPacked: true,
      isEvalSupported: false,
      useSystemFonts: true,
    });

    const pdfDocument = await loadingTask.promise;
    const page = await pdfDocument.getPage(1);
    const viewport = page.getViewport({ scale: PDF_RENDER_SCALE });
    const w = Math.ceil(viewport.width);
    const h = Math.ceil(viewport.height);
    const canvas = createCanvas(w, h);
    const context = canvas.getContext("2d");
    if (!context) {
      await pdfDocument.destroy();
      return null;
    }

    await page.render({
      canvasContext: context as unknown as CanvasRenderingContext2D,
      viewport,
      canvas: canvas as unknown as HTMLCanvasElement,
    }).promise;

    await pdfDocument.destroy();

    const png = await canvas.encode("png");
    const buf = Buffer.from(png);
    if (buf.length > 500) {
      console.log("[pdf-rasterize] PDF CONVERT SUCCESS (pdfjs+canvas), bytes:", buf.length);
      return buf;
    }
  } catch (e) {
    console.error(
      "[pdf-rasterize] pdfjs+canvas error:",
      e instanceof Error ? e.message : e,
      e instanceof Error ? e.stack : "",
    );
  }
  return null;
}

/** Fallback: pdf-to-img (also pdfjs-based, no poppler). */
async function tryPdfToImg(pdfBuffer: Buffer): Promise<Buffer | null> {
  try {
    const { pdf } = await import("pdf-to-img");
    const doc = await pdf(pdfBuffer, { scale: PDF_RENDER_SCALE });
    try {
      const page = await doc.getPage(1);
      const pageBuf = Buffer.isBuffer(page) ? page : Buffer.from(page);
      if (pageBuf.length > 500) {
        console.log("[pdf-rasterize] pdf-to-img ok, bytes:", pageBuf.length);
        return pageBuf;
      }
    } finally {
      if (!doc.isDestroyed) await doc.destroy();
    }
  } catch (e) {
    console.warn("[pdf-rasterize] pdf-to-img:", e instanceof Error ? e.message : e);
  }
  return null;
}
