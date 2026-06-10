import { NextRequest, NextResponse } from "next/server";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import {
  checkBucketExists,
  STORAGE_BUCKET_MISSING,
  sourceFilesBucketName,
} from "@/lib/storage/buckets";
import {
  type BusinessDocumentCategory,
  uploadBusinessDocument,
} from "@/lib/storage/business-documents";
import {
  isSupportedMimeType,
  resolveUploadMimeType,
  bufferFromUploadFile,
} from "@/lib/document-scan/file-utils";

const MAX_BYTES = 12 * 1024 * 1024;

function parseCategory(raw: FormDataEntryValue | null): BusinessDocumentCategory {
  const v = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (v === "income" || v === "expense" || v === "ocr" || v === "zreport") return v;
  return "expense";
}

export async function POST(req: NextRequest) {
  const block = await requireDb();
  if (block) return block;

  const session = await getSessionFromCookie();
  if (!session) {
    return NextResponse.json({ ok: false, error: "נדרשת התחברות" }, { status: 401 });
  }

  try {
    const sourceBucket = sourceFilesBucketName();
    if (!(await checkBucketExists(sourceBucket))) {
      return NextResponse.json({ ok: false, error: STORAGE_BUCKET_MISSING }, { status: 503 });
    }

    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: "קובץ לא תקין" }, { status: 400 });
    }
    if (file.size === 0 || file.size > MAX_BYTES) {
      return NextResponse.json({ ok: false, error: "גודל קובץ לא תקין" }, { status: 400 });
    }

    const mimeType = resolveUploadMimeType(file);
    if (!isSupportedMimeType(mimeType)) {
      return NextResponse.json(
        { ok: false, error: "סוג קובץ לא נתמך — PDF, JPG, PNG, WEBP" },
        { status: 415 },
      );
    }

    const category = parseCategory(formData.get("category"));
    const buffer = await bufferFromUploadFile(file);
    const fileName = file.name || `upload.${mimeType.split("/")[1] ?? "bin"}`;
    const uploaded = await uploadBusinessDocument({
      buffer,
      fileName,
      contentType: mimeType,
      category,
    });

    return NextResponse.json({
      ok: true,
      data: {
        fileName: uploaded.fileName,
        fileType: uploaded.fileType,
        mimeType: uploaded.fileType,
        storageBucket: uploaded.bucket,
        storagePath: uploaded.storagePath,
        viewUrl: uploaded.viewUrl,
        uploadedById: session.sub ?? null,
      },
    });
  } catch (e) {
    console.error("[source-documents upload]", e);
    const message = e instanceof Error ? e.message : "שגיאה בהעלאה";
    const status = message === STORAGE_BUCKET_MISSING ? 503 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
