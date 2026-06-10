import { mergeGeminiInvoices } from "./merge-gemini-invoice";
import { renderAllPdfPagesForScan } from "./pdf-to-image";
import type { PreparedScanInput } from "./prepare-scan-input";
import { ScanServiceError } from "./scan-errors";
import {
  runGeminiVision,
  type GeminiInvoiceJson,
  type GeminiVisionResult,
} from "./gemini-vision";

function confidenceFromInvoice(invoice: GeminiInvoiceJson): number {
  const detected = [
    invoice.supplier,
    invoice.invoiceNumber,
    invoice.date,
    invoice.subtotal,
    invoice.vat,
    invoice.total,
    invoice.lineItems.length > 0 ? invoice.lineItems.length : null,
  ].filter((value) => value != null).length;
  return detected > 0 ? Math.min(0.98, 0.72 + detected * 0.04) : 0.2;
}

/**
 * PDF native → Gemini, fallback: extract pages → JPEG → Gemini per page → merge.
 */
export async function scanInvoiceWithGemini(
  prepared: PreparedScanInput,
  intakeMode: "quick" | "full",
): Promise<GeminiVisionResult & { scanPath: "pdf_native" | "pdf_pages" | "image" }> {
  if (prepared.scanMode === "pdf_native" && prepared.pdfBuffer) {
    try {
      const result = await runGeminiVision({
        buffer: prepared.pdfBuffer,
        mimeType: "application/pdf",
        fileName: prepared.fileName,
        intakeMode,
        pageCount: prepared.pdfPageCount,
      });
      return { ...result, scanPath: "pdf_native" };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn("[SCAN_INVOICE] PDF native failed — falling back to page images", msg);
      if (e instanceof ScanServiceError && e.code === "SCAN_NOT_CONFIGURED") throw e;
    }

    const pages = await renderAllPdfPagesForScan(prepared.pdfBuffer);
    console.log("[SCAN_INVOICE] PDF page fallback", { pages: pages.length });

    const invoices: GeminiInvoiceJson[] = [];
    let lastRaw = "";
    let model = "";

    for (const page of pages) {
      const pageResult = await runGeminiVision({
        buffer: page.buffer,
        mimeType: page.mimeType,
        fileName: `${prepared.fileName.replace(/\.pdf$/i, "")}-p${page.pageNumber}.jpg`,
        intakeMode,
        pageNumber: page.pageNumber,
        pageCount: pages.length,
      });
      invoices.push(pageResult.invoice);
      lastRaw = pageResult.rawResponse;
      model = pageResult.model;
    }

    const invoice = mergeGeminiInvoices(invoices);
    return {
      provider: "gemini_vision",
      model,
      invoice,
      rawResponse: lastRaw,
      confidence: confidenceFromInvoice(invoice),
      scanPath: "pdf_pages",
    };
  }

  const result = await runGeminiVision({
    buffer: prepared.buffer,
    mimeType: prepared.mimeType,
    fileName: prepared.fileName,
    intakeMode,
  });
  return { ...result, scanPath: "image" };
}
