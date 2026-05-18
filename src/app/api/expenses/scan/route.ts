import { NextRequest } from "next/server";
import { requireDb } from "@/lib/api-route";
import { scanJsonError, scanJsonSuccess } from "@/lib/ocr/api-response";
import { isSupportedMimeType, scanDocument, OcrServiceError } from "@/lib/ocr";

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
 * POST /api/expenses/scan — always JSON via OCR.space.
 */
export async function POST(req: NextRequest) {
  const started = Date.now();
  console.log("[OCR] OCR request start route=expenses/scan provider=ocr.space");

  try {
    const block = await requireDb();
    if (block) return block;

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return scanJsonError("file field is required", 400, "VALIDATION");
    }

    console.log("[OCR] file", {
      type: file.type,
      name: file.name,
      size: file.size,
    });

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

    let mimeType = file.type || "application/octet-stream";
    if (mimeType === "application/octet-stream" && /\.pdf$/i.test(file.name || "")) {
      mimeType = "application/pdf";
    }

    if (!isSupportedMimeType(mimeType)) {
      return scanJsonError(`unsupported file type "${mimeType}"`, 415, "VALIDATION");
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const fileName = file.name || `upload.${mimeType.split("/")[1] ?? "bin"}`;

    const { debug, partial, ...data } = await scanDocument({
      buffer,
      fileName,
      mimeType,
    });
    console.log("[OCR] scan complete ms:", Date.now() - started, {
      items: data.items.length,
      confidence: data.confidence,
      error: data.error ?? null,
      partial,
      debug,
    });

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
        e.code === "OCR_PROVIDER_ERROR"
          ? `OCR.space: ${e.message}`
          : e.message;
      return scanJsonError(userMessage, status, e.code);
    }

    const message = timedOut
      ? "OCR timed out — try a smaller or clearer image"
      : e instanceof Error
        ? e.message
        : "internal error";
    console.error("[OCR] OCR errors:", e instanceof Error ? e.stack ?? e.message : e);
    return scanJsonError(message, timedOut ? 504 : 500, timedOut ? "OCR_TIMEOUT" : "OCR_PROVIDER_ERROR");
  }
}
