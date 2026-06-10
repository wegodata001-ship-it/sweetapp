import { mergeGeminiZReports } from "./merge-gemini-z-report";
import { renderAllPdfPagesForScan } from "./pdf-to-image";
import type { PreparedScanInput } from "./prepare-scan-input";
import { ScanServiceError } from "./scan-errors";
import {
  runGeminiZReportVision,
  type GeminiZReportJson,
  type GeminiZReportVisionResult,
} from "./gemini-z-report";

function confidenceFromZReport(z: GeminiZReportJson): number {
  const detected = [
    z.zNumber,
    z.date,
    z.cashTaxable,
    z.cashExempt,
    z.creditTaxable,
    z.creditExempt,
    z.transfers,
    z.grandTotal,
  ].filter((value) => value != null).length;
  return detected > 0 ? Math.min(0.98, 0.72 + detected * 0.04) : 0.2;
}

export async function scanZReportWithGemini(
  prepared: PreparedScanInput,
): Promise<GeminiZReportVisionResult & { scanPath: "pdf_native" | "pdf_pages" | "image" }> {
  if (prepared.scanMode === "pdf_native" && prepared.pdfBuffer) {
    try {
      const result = await runGeminiZReportVision({
        buffer: prepared.pdfBuffer,
        mimeType: "application/pdf",
        fileName: prepared.fileName,
        pageCount: prepared.pdfPageCount,
      });
      return { ...result, scanPath: "pdf_native" };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn("[SCAN_Z_REPORT] PDF native failed — falling back to page images", msg);
      if (e instanceof ScanServiceError && e.code === "SCAN_NOT_CONFIGURED") throw e;
    }

    const pages = await renderAllPdfPagesForScan(prepared.pdfBuffer);
    const zPages: GeminiZReportJson[] = [];
    let lastRaw = "";
    let model = "";

    for (const page of pages) {
      const pageResult = await runGeminiZReportVision({
        buffer: page.buffer,
        mimeType: page.mimeType,
        fileName: `${prepared.fileName.replace(/\.pdf$/i, "")}-p${page.pageNumber}.jpg`,
        pageNumber: page.pageNumber,
        pageCount: pages.length,
      });
      zPages.push(pageResult.zReport);
      lastRaw = pageResult.rawResponse;
      model = pageResult.model;
    }

    const zReport = mergeGeminiZReports(zPages);
    return {
      provider: "gemini_vision",
      model,
      zReport,
      rawResponse: lastRaw,
      confidence: confidenceFromZReport(zReport),
      scanPath: "pdf_pages",
    };
  }

  const result = await runGeminiZReportVision({
    buffer: prepared.buffer,
    mimeType: prepared.mimeType,
    fileName: prepared.fileName,
  });
  return { ...result, scanPath: "image" };
}
