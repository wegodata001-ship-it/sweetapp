import { NextRequest, NextResponse } from "next/server";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import {
  previewDocumentEmailAttachments,
  type DocumentEmailAttachmentSelection,
} from "@/lib/finance/accountant-email-attachments";

export const dynamic = "force-dynamic";

function parseSelection(body: {
  includePdf?: unknown;
  includeSource?: unknown;
  sendMode?: unknown;
}): DocumentEmailAttachmentSelection {
  if (body.sendMode === "pdf_only") return { includePdf: true, includeSource: false };
  if (body.sendMode === "source_only") return { includePdf: false, includeSource: true };
  if (body.sendMode === "pdf_and_source") return { includePdf: true, includeSource: true };
  return {
    includePdf: body.includePdf !== false,
    includeSource: body.includeSource !== false,
  };
}

/** POST /api/documents/accountant/email/preview — ספירת קבצים לפי בחירת המשתמש */
export async function POST(req: NextRequest) {
  const block = await requireDb();
  if (block) return block;

  const session = await getSessionFromCookie();
  if (!session?.sub) {
    return NextResponse.json({ ok: false, error: "נדרשת התחברות" }, { status: 401 });
  }

  let body: {
    documentIds?: unknown;
    includePdf?: unknown;
    includeSource?: unknown;
    sendMode?: unknown;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "גוף בקשה לא תקין" }, { status: 400 });
  }

  const documentIds = Array.isArray(body.documentIds)
    ? body.documentIds.filter((x): x is string => typeof x === "string" && x.length > 0)
    : [];

  if (documentIds.length === 0) {
    return NextResponse.json({ ok: false, error: "לא נבחרו מסמכים" }, { status: 400 });
  }

  const selection = parseSelection(body);
  if (!selection.includePdf && !selection.includeSource) {
    return NextResponse.json({ ok: false, error: "יש לבחור לפחות סוג קובץ אחד" }, { status: 400 });
  }

  const preview = await previewDocumentEmailAttachments({ documentIds, selection });
  return NextResponse.json({ ok: true, data: preview });
}
