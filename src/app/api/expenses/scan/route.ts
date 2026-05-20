import { NextRequest } from "next/server";
import { requireDb } from "@/lib/api-route";
import { scanJsonError, scanJsonSuccess } from "@/lib/ocr/api-response";
import {
  isSupportedMimeType,
  scanDocument,
  OcrServiceError,
  getOcrProvider,
  logOcrFlow,
} from "@/lib/ocr";
import { hashFileBuffer } from "@/lib/ocr/ocr-cache";
import {
  bufferFromUploadFile,
  logOcrFileIntegrity,
  resolveUploadMimeType,
} from "@/lib/ocr/original-file-integrity";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 12 * 1024 * 1024;

function isTimeoutError(e: unknown): boolean {
  if (e instanceof OcrServiceError && e.code === "OCR_TIMEOUT") return true;
  if (!(e instanceof Error)) return false;
  const m = e.message.toLowerCase();
  return (
    m.includes("timeout") ||
    m.includes("timed out") ||
    m.includes("function_invocation_timeout") ||
    e.name === "TimeoutError"
  );
}

/**
 * POST /api/expenses/scan — OCR על הקובץ המקורי בלבד (ללא resize/compress).
 */
export async function POST(req: NextRequest) {
  const started = Date.now();
  console.log("[OCR PROVIDER]", getOcrProvider());
  logOcrFlow({ route: "expenses/scan" });

  try {
    const block = await requireDb();
    if (block) return block;

    const formData = await req.formData();
    const file = formData.get("file");
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
    console.log("[OCR] upload mime from client:", file.type, "→ resolved:", mimeType);

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

    logOcrFileIntegrity({
      size: originalBuffer.length,
      mime: mimeType,
      hash,
      fileName,
      route: "expenses/scan",
    });

    const { debug, partial, ...data } = await scanDocument({
      buffer: originalBuffer,
      fileName,
      mimeType,
      fileHash: hash,
    });

    console.log("[OCR] scan complete ms:", Date.now() - started);
    console.log("[OCR PARSED RESULT] items:", data.items.length, "partial:", partial);

    return scanJsonSuccess({ ...data, partial }, debug);
  } catch (e) {
    const timedOut = isTimeoutError(e);

    if (e instanceof OcrServiceError) {
      console.error("[OCR] OCR errors:", e.code, e.message);
      const status =
        e.code === "FILE_TOO_LARGE"
          ? 413
          : e.code === "OCR_NOT_CONFIGURED"
            ? 503
            : timedOut
              ? 504
              : 502;
      const userMessage =
        e.code === "OCR_NOT_CONFIGURED"
          ? "Google Vision not configured — הוסף GOOGLE_CLOUD_VISION_API_KEY ל-.env"
          : e.code === "OCR_PROVIDER_ERROR" || e.code === "OCR_TIMEOUT"
            ? "שירות OCR זמנית לא זמין"
            : e.message;
      return scanJsonError(userMessage, status, e.code);
    }

    console.error("[OCR] OCR errors:", e instanceof Error ? e.stack ?? e.message : e);
    return scanJsonError(
      "שירות OCR זמנית לא זמין",
      timedOut ? 504 : 500,
      timedOut ? "OCR_TIMEOUT" : "OCR_PROVIDER_ERROR",
    );
  }
}
