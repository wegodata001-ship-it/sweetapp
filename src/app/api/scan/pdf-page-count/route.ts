import { NextRequest, NextResponse } from "next/server";
import { requireDb } from "@/lib/api-route";
import {
  bufferFromUploadFile,
  isSupportedMimeType,
  resolveUploadMimeType,
} from "@/lib/document-scan/file-utils";
import { getPdfPageCount, isPdfBuffer } from "@/lib/document-scan/pdf-to-image";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BYTES = 12 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const block = await requireDb();
  if (block) return block;

  try {
    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: "קובץ לא תקין" }, { status: 400 });
    }
    if (file.size === 0 || file.size > MAX_BYTES) {
      return NextResponse.json({ ok: false, error: "גודל קובץ לא תקין" }, { status: 400 });
    }

    const mimeType = resolveUploadMimeType(file);
    if (!isSupportedMimeType(mimeType) || mimeType !== "application/pdf") {
      return NextResponse.json({ ok: false, error: "נדרש קובץ PDF" }, { status: 415 });
    }

    const buffer = await bufferFromUploadFile(file);
    if (!isPdfBuffer(buffer)) {
      return NextResponse.json({ ok: true, pageCount: 0 });
    }

    const pageCount = await getPdfPageCount(buffer);
    return NextResponse.json({ ok: true, pageCount });
  } catch (e) {
    console.error("[PDF_PAGE_COUNT]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה בקריאת PDF" },
      { status: 500 },
    );
  }
}
