import { NextRequest } from "next/server";
import { requireDb } from "@/lib/api-route";
import {
  scanJsonError,
  scanJsonSuccess,
  scanDocument,
  ScanServiceError,
  SCAN_TIMEOUT_USER_MESSAGE,
  hashFileBuffer,
  isSupportedMimeType,
  resolveUploadMimeType,
  bufferFromUploadFile,
} from "@/lib/document-scan";
import { logScanEnv } from "@/lib/document-scan/scan-env";
import { scanStreamResponse } from "@/lib/document-scan/scan-stream";
import type { ScanProgressPhase } from "@/lib/document-scan/scan-progress";
import type { ScannedDocument } from "@/lib/document-scan/api-response";
import {
  notifyDocumentScanFailed,
  notifyDocumentScanSuccess,
  notifyDocumentScanUnlinked,
} from "@/lib/notifications/document-scan-notifications";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 45;

const MAX_BYTES = 12 * 1024 * 1024;

function isTimeoutError(e: unknown): boolean {
  if (e instanceof ScanServiceError && e.code === "SCAN_TIMEOUT") return true;
  if (!(e instanceof Error)) return false;
  const m = e.message.toLowerCase();
  return (
    m.includes("timeout") ||
    m.includes("timed out") ||
    m.includes("function_invocation_timeout") ||
    e.name === "TimeoutError"
  );
}

function scanErrorResponse(scanError: unknown) {
  console.error(scanError);
  const timedOut = isTimeoutError(scanError);

  if (scanError instanceof ScanServiceError) {
    const status =
      scanError.code === "FILE_TOO_LARGE"
        ? 413
        : scanError.code === "SCAN_NOT_CONFIGURED"
          ? 503
          : scanError.code === "SCAN_PROVIDER_BUSY"
            ? 503
            : timedOut
              ? 504
              : 502;
    const userMessage =
      scanError.code === "SCAN_NOT_CONFIGURED"
        ? "שירות הסריקה החכמה אינו מוגדר — בדוק GEMINI_API_KEY ב-.env"
        : scanError.code === "SCAN_PROVIDER_BUSY"
          ? "שרת ה-AI עמוס — נסה שוב בעוד מספר רגעים"
          : scanError.code === "SCAN_TIMEOUT"
            ? SCAN_TIMEOUT_USER_MESSAGE
            : scanError.message;
    return scanJsonError(userMessage, status, scanError.code);
  }

  return scanJsonError(
    scanError instanceof Error ? scanError.message : "שגיאה בסריקה",
    timedOut ? 504 : 500,
    timedOut ? "SCAN_TIMEOUT" : "SCAN_PROVIDER_ERROR",
  );
}

async function runExpenseScan(params: {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
  hash: string;
  intakeMode: "quick" | "full";
  compareSupplierPrices?: boolean;
  onProgress?: (phase: ScanProgressPhase) => void;
}) {
  const { debug, partial, ...data } = await scanDocument({
    buffer: params.buffer,
    fileName: params.fileName,
    mimeType: params.mimeType,
    fileHash: params.hash,
    intakeMode: params.intakeMode,
    compareSupplierPrices: params.compareSupplierPrices,
    onProgress: params.onProgress,
  });

  if (data.error === "SCAN_READ_FAILED") {
    throw Object.assign(new ScanServiceError("SCAN_READ_FAILED", "פענוח נכשל\nנא להעלות צילום חד יותר"), {
      httpStatus: 422,
    });
  }

  return { data: { ...data, partial }, debug };
}

async function emitScanNotifications(
  data: ScannedDocument & { error?: string },
  fileName: string,
  hash: string,
): Promise<void> {
  if (data.error === "SCAN_READ_FAILED") {
    await notifyDocumentScanFailed({
      fileName,
      fileHash: hash,
      reason: "פענוח המסמך נכשל",
    });
    return;
  }

  await notifyDocumentScanSuccess({ fileName, fileHash: hash });

  const hasSupplier = Boolean(data.supplierId?.trim());
  const supplierDetected = Boolean(data.supplierName?.trim() || data.supplierRawName?.trim());
  if (!hasSupplier && supplierDetected) {
    await notifyDocumentScanUnlinked({
      fileName,
      fileHash: hash,
      supplierName: data.supplierName || data.supplierRawName,
    });
  }
}

/** POST /api/expenses/scan — ניתוח מסמכים באמצעות Gemini AI בלבד */
export async function POST(req: NextRequest) {
  console.log("SCAN_START");
  logScanEnv();

  try {
    const block = await requireDb();
    if (block) return block;

    const formData = await req.formData();
    const file = formData.get("file");
    const intakeModeRaw = formData.get("intakeMode");
    const intakeMode = intakeModeRaw === "full" ? "full" : "quick";
    const documentKind = formData.get("documentKind") === "income" ? "income" : "expense";
    const compareSupplierPrices = documentKind === "expense";
    const useStream = formData.get("stream") === "1";

    if (!(file instanceof File)) {
      return scanJsonError("Invalid file — expected multipart field 'file'", 400, "VALIDATION");
    }
    if (file.size === 0) {
      return scanJsonError("uploaded file is empty", 400, "VALIDATION");
    }
    if (file.size > MAX_BYTES) {
      return scanJsonError(
        `file too large (max ${Math.floor(MAX_BYTES / 1024 / 1024)} MB)`,
        413,
        "FILE_TOO_LARGE",
      );
    }

    const mimeType = resolveUploadMimeType(file);
    if (!isSupportedMimeType(mimeType)) {
      return scanJsonError(
        `unsupported file type "${mimeType}" — use PNG, JPEG, or PDF`,
        415,
        "VALIDATION",
      );
    }

    const originalBuffer = await bufferFromUploadFile(file);
    const hash = hashFileBuffer(originalBuffer);
    const fileName = file.name || `upload.${mimeType.split("/")[1] ?? "bin"}`;

    if (useStream) {
      return scanStreamResponse(async (onProgress) => {
        try {
          const { data, debug } = await runExpenseScan({
            buffer: originalBuffer,
            fileName,
            mimeType,
            hash,
            intakeMode,
            compareSupplierPrices,
            onProgress,
          });
          void emitScanNotifications(data, fileName, hash);
          return {
            type: "result",
            success: true,
            ok: true,
            data,
            provider: debug?.provider ?? "gemini_vision",
            debug,
          };
        } catch (e) {
          if (e instanceof ScanServiceError && e.code === "SCAN_READ_FAILED") {
            return {
              type: "error",
              success: false,
              ok: false,
              error: e.message,
              code: "SCAN_READ_FAILED",
              provider: "gemini_vision",
            };
          }
          throw e;
        }
      });
    }

    const { data, debug } = await runExpenseScan({
      buffer: originalBuffer,
      fileName,
      mimeType,
      hash,
      intakeMode,
      compareSupplierPrices,
    });
    void emitScanNotifications(data, fileName, hash);
    return scanJsonSuccess(data, debug);
  } catch (scanError) {
    if (scanError instanceof ScanServiceError && scanError.code === "SCAN_READ_FAILED") {
      void notifyDocumentScanFailed({
        fileName: "scan-upload",
        fileHash: "failed-read",
        reason: scanError.message,
      });
      return scanJsonError(scanError.message, 422, "SCAN_READ_FAILED");
    }
    const fileName = "scan-upload";
    void notifyDocumentScanFailed({
      fileName,
      fileHash: `err-${Date.now()}`,
      reason: scanError instanceof Error ? scanError.message : "שגיאה בסריקה",
    });
    return scanErrorResponse(scanError);
  }
}
