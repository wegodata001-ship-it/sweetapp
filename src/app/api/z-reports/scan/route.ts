import { NextRequest, NextResponse } from "next/server";
import { requireDb } from "@/lib/api-route";
import {
  scanJsonError,
  ScanServiceError,
  SCAN_TIMEOUT_USER_MESSAGE,
  hashFileBuffer,
  isSupportedMimeType,
  resolveUploadMimeType,
  bufferFromUploadFile,
} from "@/lib/document-scan";
import { runZReportScan } from "@/lib/document-scan/z-report-scan";
import { scanStreamResponse } from "@/lib/document-scan/scan-stream";
import type { ScanProgressPhase } from "@/lib/document-scan/scan-progress";

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
    "שירות הסריקה זמנית לא זמין",
    timedOut ? 504 : 500,
    timedOut ? "SCAN_TIMEOUT" : "SCAN_PROVIDER_ERROR",
  );
}

async function runZScan(params: {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
  hash: string;
  onProgress?: (phase: ScanProgressPhase) => void;
}) {
  const data = await runZReportScan({
    buffer: params.buffer,
    fileName: params.fileName,
    mimeType: params.mimeType,
    fileHash: params.hash,
    onProgress: params.onProgress,
  });

  if (data.error === "SCAN_READ_FAILED") {
    throw new ScanServiceError("SCAN_READ_FAILED", "פענוח נכשל\nנא להעלות צילום חד יותר");
  }

  return data;
}

/** POST /api/z-reports/scan — סריקת דוח Z דרך Gemini AI */
export async function POST(req: NextRequest) {
  console.log("SCAN_START");

  try {
    const block = await requireDb();
    if (block) return block;

    const formData = await req.formData();
    const file = formData.get("file");
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
          const data = await runZScan({
            buffer: originalBuffer,
            fileName,
            mimeType,
            hash,
            onProgress,
          });
          return { type: "result", success: true, ok: true, data };
        } catch (e) {
          if (e instanceof ScanServiceError && e.code === "SCAN_READ_FAILED") {
            return {
              type: "error",
              success: false,
              ok: false,
              error: e.message,
              code: "SCAN_READ_FAILED",
            };
          }
          throw e;
        }
      });
    }

    const data = await runZScan({
      buffer: originalBuffer,
      fileName,
      mimeType,
      hash,
    });
    return NextResponse.json({ success: true, ok: true, data });
  } catch (e) {
    if (e instanceof ScanServiceError && e.code === "SCAN_READ_FAILED") {
      return scanJsonError("פענוח נכשל\nנא להעלות צילום חד יותר", 422, "SCAN_READ_FAILED");
    }
    return scanErrorResponse(e);
  }
}
