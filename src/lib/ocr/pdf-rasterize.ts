import { randomUUID } from "node:crypto";
import { unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";

const RASTER_WIDTH = 2200;

/**
 * PDF page 1 → PNG buffer (pdf2pic → pdf-to-img fallbacks).
 * Never returns text — image only for Tesseract.
 */
export async function rasterizePdfPage1(pdfBuffer: Buffer): Promise<Buffer | null> {
  const fromPdf2Pic = await tryPdf2Pic(pdfBuffer);
  if (fromPdf2Pic) return fromPdf2Pic;

  const fromPdfToImg = await tryPdfToImg(pdfBuffer);
  if (fromPdfToImg) return fromPdfToImg;

  console.error("[pdf-rasterize] All PDF→image converters failed");
  return null;
}

/** Trim margins so OCR focuses on invoice content, not viewer chrome. */
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

async function tryPdf2Pic(pdfBuffer: Buffer): Promise<Buffer | null> {
  try {
    const { fromBuffer } = await import("pdf2pic");
    const convert = fromBuffer(pdfBuffer, {
      density: 300,
      format: "png",
      width: RASTER_WIDTH,
      height: 3200,
    });
    const page = await convert(1, { responseType: "buffer" });
    const buf =
      page && typeof page === "object" && "buffer" in page && page.buffer
        ? Buffer.isBuffer(page.buffer)
          ? page.buffer
          : Buffer.from(page.buffer as Uint8Array)
        : null;
    if (buf && buf.length > 1000) {
      console.log("[pdf-rasterize] pdf2pic ok, bytes:", buf.length);
      return buf;
    }
  } catch (e) {
    console.warn("[pdf-rasterize] pdf2pic:", e instanceof Error ? e.message : e);
  }

  const tmpPath = join(tmpdir(), `wego-invoice-${randomUUID()}.pdf`);
  try {
    await writeFile(tmpPath, pdfBuffer);
    const { fromPath } = await import("pdf2pic");
    const convert = fromPath(tmpPath, {
      density: 300,
      format: "png",
      width: RASTER_WIDTH,
      height: 3200,
    });
    const page = await convert(1, { responseType: "buffer" });
    const buf =
      page && typeof page === "object" && "buffer" in page && page.buffer
        ? Buffer.isBuffer(page.buffer)
          ? page.buffer
          : Buffer.from(page.buffer as Uint8Array)
        : null;
    if (buf && buf.length > 1000) {
      console.log("[pdf-rasterize] pdf2pic (file) ok, bytes:", buf.length);
      return buf;
    }
  } catch (e) {
    console.warn("[pdf-rasterize] pdf2pic file:", e instanceof Error ? e.message : e);
  } finally {
    await unlink(tmpPath).catch(() => undefined);
  }

  return null;
}

async function tryPdfToImg(pdfBuffer: Buffer): Promise<Buffer | null> {
  try {
    const { pdf } = await import("pdf-to-img");
    const doc = await pdf(pdfBuffer, { scale: 4 });
    try {
      const page = await doc.getPage(1);
      const pageBuf = Buffer.isBuffer(page) ? page : Buffer.from(page);
      if (pageBuf.length > 1000) {
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
