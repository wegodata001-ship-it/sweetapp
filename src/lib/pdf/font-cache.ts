import type { PDFDocument } from "pdf-lib";
import { PdfFontSet, preloadPdfFonts, type PdfFontWeight } from "./pdf-fonts";

/**
 * Font bundle for the pre-existing document generators.
 *
 * Previously this embedded a single Hebrew face fetched from GitHub, which is why Arabic
 * text rendered as boxes. It now hands out handles into the shared `PdfFontSet`, so the same
 * generators pick a font per script and get Arabic shaping — without any change to their
 * layout maths.
 */

/** A weight of the shared font set. The concrete face is chosen per character when drawing. */
export type PdfFontHandle = {
  set: PdfFontSet;
  weight: PdfFontWeight;
};

export type InvoicePdfFonts = {
  set: PdfFontSet;
  he: PdfFontHandle;
  heBold: PdfFontHandle;
  en: PdfFontHandle;
  enBold: PdfFontHandle;
  /** Kept for call sites that used a separate numeric font; digits resolve automatically. */
  num: PdfFontHandle;
};

export async function embedInvoicePdfFonts(pdfDoc: PDFDocument): Promise<InvoicePdfFonts> {
  await preloadPdfFonts();
  const set = PdfFontSet.create(pdfDoc);
  const regular: PdfFontHandle = { set, weight: "regular" };
  const bold: PdfFontHandle = { set, weight: "bold" };
  return { set, he: regular, heBold: bold, en: regular, enBold: bold, num: regular };
}
