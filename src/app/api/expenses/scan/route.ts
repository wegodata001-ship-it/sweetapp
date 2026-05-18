import { NextRequest, NextResponse } from "next/server";
import { requireDb } from "@/lib/api-route";
import {
  SUPPORTED_MIME_TYPES,
  isSupportedMimeType,
  scanDocument,
} from "@/lib/ocr";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/** Vercel / serverless — OCR can take 30–60s on PDF */
export const maxDuration = 60;

const MAX_BYTES = 12 * 1024 * 1024;

function jsonError(message: string, status: number, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error: message, ...extra }, { status });
}

/**
 * POST /api/expenses/scan — always returns JSON `{ ok, data? | error? }`.
 */
export async function POST(req: NextRequest) {
  console.log("[OCR] OCR START");

  try {
    const block = await requireDb();
    if (block) return block;

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return jsonError("file field is required", 400);
    }

    console.log("[OCR] FILE TYPE:", file.type, "NAME:", file.name);
    console.log("[OCR] FILE SIZE:", file.size);

    if (file.size === 0) {
      return jsonError("uploaded file is empty", 400);
    }
    if (file.size > MAX_BYTES) {
      return jsonError(`file too large (max ${Math.floor(MAX_BYTES / 1024 / 1024)} MB)`, 413);
    }

    let mimeType = file.type || "application/octet-stream";
    if (mimeType === "application/octet-stream" && /\.pdf$/i.test(file.name || "")) {
      mimeType = "application/pdf";
    }

    if (!isSupportedMimeType(mimeType)) {
      return jsonError(`unsupported file type "${mimeType}"`, 415, {
        accepted: SUPPORTED_MIME_TYPES,
      });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const fileName = file.name || `upload.${mimeType.split("/")[1] ?? "bin"}`;

    console.log("[OCR] Resolved mimeType:", mimeType, "pipeline:", mimeType === "application/pdf" ? "pdf" : "image");

    const data = await scanDocument({ buffer, fileName, mimeType });
    console.log("[OCR] SCAN COMPLETE items:", data.items.length, "engine:", data.engine);
    return NextResponse.json({ ok: true, data });
  } catch (e) {
    const message = e instanceof Error ? e.message : "internal error";
    console.error("[OCR] OCR ERROR:", e instanceof Error ? e.stack ?? e.message : e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
