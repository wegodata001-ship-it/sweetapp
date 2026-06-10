/**
 * בדיקות pipeline PDF — הרצה: npm run test:pdf-pipeline
 */
import { PDFDocument, StandardFonts } from "pdf-lib";
import { mergeGeminiInvoices } from "./merge-gemini-invoice";
import { mergeGeminiZReports } from "./merge-gemini-z-report";
import { prepareScanInput } from "./prepare-scan-input";
import { getPdfPageCount, isPdfBuffer, renderAllPdfPagesForScan } from "./pdf-to-image";
import { isPdfMimeType, resolveUploadMimeType } from "./upload-mime";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

async function makeTextPdf(pageCount: number, label: string): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pageCount; i++) {
    const page = pdf.addPage([595, 842]);
    page.drawText(`${label} page ${i + 1}`, { x: 50, y: 780, size: 14, font });
  }
  return Buffer.from(await pdf.save());
}

/** PDF "סרוק" — עמוד עם תמונת PNG מוטמעת */
async function makeScannedPdf(): Promise<Buffer> {
  const sharpMod = await import("sharp");
  const png = await sharpMod.default({
    create: { width: 400, height: 200, channels: 3, background: { r: 240, g: 240, b: 240 } },
  })
    .png()
    .toBuffer();

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const image = await pdf.embedPng(png);
  const { width, height } = image.scale(0.8);
  page.drawImage(image, { x: 50, y: 500, width, height });
  page.drawText("Scanned receipt", { x: 50, y: 450, size: 10 });
  return Buffer.from(await pdf.save());
}

async function runTests(): Promise<void> {
  console.log("PDF pipeline tests…");

  const single = await makeTextPdf(1, "single");
  assert(isPdfBuffer(single), "single-page PDF magic bytes");
  assert((await getPdfPageCount(single)) === 1, "single page count");

  const multi = await makeTextPdf(3, "multi");
  assert((await getPdfPageCount(multi)) === 3, "multi page count");

  const computerGenerated = await makeTextPdf(2, "computer");
  assert(isPdfBuffer(computerGenerated), "computer-generated PDF magic bytes");
  assert((await getPdfPageCount(computerGenerated)) === 2, "computer-generated page count");

  const scanned = await makeScannedPdf();
  assert(isPdfBuffer(scanned), "scanned PDF magic bytes");
  assert((await getPdfPageCount(scanned)) === 1, "scanned PDF page count");
  const scannedPages = await renderAllPdfPagesForScan(scanned);
  assert(scannedPages.length === 1, "scanned PDF renders one page");
  assert(scannedPages[0]!.buffer.length > 100, "scanned PDF page produces image bytes");

  const preparedSingle = await prepareScanInput(single, "application/pdf", "invoice.pdf");
  assert(preparedSingle.scanMode === "pdf_native", "single PDF native mode");
  assert(preparedSingle.mimeType === "application/pdf", "single PDF mime preserved");
  assert(preparedSingle.pdfPageCount === 1, "single PDF page count in prepared");

  const preparedMulti = await prepareScanInput(multi, "application/pdf", "invoice-multi.pdf");
  assert(preparedMulti.scanMode === "pdf_native", "multi PDF native mode");
  assert(preparedMulti.pdfPageCount === 3, "multi PDF page count in prepared");

  const pages = await renderAllPdfPagesForScan(multi);
  assert(pages.length === 3, "render all pages fallback");
  assert(pages.every((p) => p.mimeType === "image/jpeg"), "pages are JPEG for Gemini fallback");

  const merged = mergeGeminiInvoices([
    {
      supplier: "A",
      invoiceNumber: "1",
      date: "2026-01-01",
      subtotal: 100,
      vat: 17,
      total: 117,
      documentType: "חשבונית",
      lineItems: [{ name: "item1", quantity: 1, unitPrice: 100, lineTotal: 100 }],
    },
    {
      supplier: null,
      invoiceNumber: null,
      date: null,
      subtotal: null,
      vat: null,
      total: 117,
      documentType: null,
      lineItems: [{ name: "item2", quantity: 2, unitPrice: 50, lineTotal: 100 }],
    },
  ]);
  assert(merged.supplier === "A", "merge keeps supplier");
  assert(merged.lineItems.length === 2, "merge combines line items");
  assert(merged.total === 117, "merge keeps last total");

  const mergedZ = mergeGeminiZReports([
    {
      zNumber: "100",
      date: "2026-01-01",
      cashTaxable: 50,
      cashExempt: null,
      creditTaxable: null,
      creditExempt: null,
      transfers: null,
      grandTotal: 50,
    },
    {
      zNumber: null,
      date: null,
      cashTaxable: null,
      cashExempt: null,
      creditTaxable: 100,
      creditExempt: null,
      transfers: null,
      grandTotal: 150,
    },
  ]);
  assert(mergedZ.zNumber === "100", "Z merge keeps z number");
  assert(mergedZ.grandTotal === 150, "Z merge keeps last grand total");

  const mimeFromName = resolveUploadMimeType({ type: "", name: "scan.pdf" });
  assert(isPdfMimeType(mimeFromName), "resolve mime from .pdf extension");

  console.log("All PDF pipeline tests passed.");
}

runTests().catch((e) => {
  console.error("PDF pipeline tests FAILED:", e);
  process.exit(1);
});
