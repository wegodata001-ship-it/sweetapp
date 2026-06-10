import { NextRequest, NextResponse } from "next/server";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { getSourceDocumentForFinancialDoc } from "@/lib/finance/source-documents";
import { getBusinessDocumentSignedUrl } from "@/lib/storage/business-documents";
import { resolveSourceFilesBucket, sourceFilesBucketName } from "@/lib/storage/buckets";

const SIGNED_URL_TTL_SEC = 3600;

/** Authenticated signed URL for viewing a private source document. */
export async function GET(req: NextRequest) {
  const block = await requireDb();
  if (block) return block;

  const session = await getSessionFromCookie();
  if (!session) {
    return NextResponse.json({ ok: false, error: "נדרשת התחברות" }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const financialDocumentId = searchParams.get("financialDocumentId")?.trim();
  const storagePath = searchParams.get("storagePath")?.trim();
  const storageBucket =
    searchParams.get("storageBucket")?.trim() || sourceFilesBucketName();

  let fileName = searchParams.get("fileName")?.trim() || "document";
  let fileType = searchParams.get("fileType")?.trim() || null;
  let path = storagePath;
  let bucket = resolveSourceFilesBucket(storageBucket);

  if (financialDocumentId) {
    const doc = await getSourceDocumentForFinancialDoc(financialDocumentId);
    if (!doc) {
      return NextResponse.json({ ok: false, error: "מסמך מקור לא נמצא" }, { status: 404 });
    }
    path = doc.storagePath;
    fileName = doc.fileName;
    fileType = doc.fileType ?? doc.mimeType;
    bucket = resolveSourceFilesBucket(doc.storageBucket);
  }

  if (!path) {
    return NextResponse.json({ ok: false, error: "נתיב קובץ חסר" }, { status: 400 });
  }

  const url = await getBusinessDocumentSignedUrl(path, bucket, SIGNED_URL_TTL_SEC);
  if (!url) {
    return NextResponse.json({ ok: false, error: "לא ניתן לפתוח את הקובץ" }, { status: 404 });
  }

  const redirect = searchParams.get("redirect") === "1";
  if (redirect) {
    return NextResponse.redirect(url);
  }

  return NextResponse.json({
    ok: true,
    data: {
      url,
      fileName,
      fileType,
      storagePath: path,
      storageBucket: bucket,
      expiresInSec: SIGNED_URL_TTL_SEC,
    },
  });
}
