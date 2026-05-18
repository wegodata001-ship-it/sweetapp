import { NextRequest, NextResponse } from "next/server";
import { requireDb } from "@/lib/api-route";
import {
  SUPPORTED_MIME_TYPES,
  isSupportedMimeType,
  scanDocument,
} from "@/lib/ocr";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BYTES = 12 * 1024 * 1024; // 12 MB inline limit (Vision PDF cap is 5MB)

/**
 * POST /api/expenses/scan
 *
 * Accepts a multipart/form-data upload with a `file` field. Runs OCR on the
 * file, parses the resulting text into a structured invoice, matches the
 * supplier/products against the catalog and tags each item with a regular
 * price baseline and high/low price flag.
 *
 * Returns JSON with shape:
 *   {
 *     ok: true,
 *     data: ScannedDocument & { error?: string }
 *   }
 *
 * Errors (HTTP 400/500) are returned with `{ ok: false, error }`.
 */
export async function POST(req: NextRequest) {
  const block = await requireDb();
  if (block) return block;
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { ok: false, error: "file field is required" },
        { status: 400 },
      );
    }
    if (file.size === 0) {
      return NextResponse.json(
        { ok: false, error: "uploaded file is empty" },
        { status: 400 },
      );
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        {
          ok: false,
          error: `file too large (max ${Math.floor(MAX_BYTES / 1024 / 1024)} MB)`,
        },
        { status: 413 },
      );
    }
    let mimeType = file.type || "application/octet-stream";
    if (
      mimeType === "application/octet-stream" &&
      /\.pdf$/i.test(file.name || "")
    ) {
      mimeType = "application/pdf";
    }
    if (!isSupportedMimeType(mimeType)) {
      return NextResponse.json(
        {
          ok: false,
          error: `unsupported file type "${mimeType}"`,
          accepted: SUPPORTED_MIME_TYPES,
        },
        { status: 415 },
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const fileName = file.name || `upload.${mimeType.split("/")[1] ?? "bin"}`;

    const data = await scanDocument({ buffer, fileName, mimeType });
    return NextResponse.json({ ok: true, data });
  } catch (e) {
    console.error(
      "[POST /api/expenses/scan] failed",
      e instanceof Error ? e.message : String(e),
    );
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "internal error" },
      { status: 500 },
    );
  }
}
