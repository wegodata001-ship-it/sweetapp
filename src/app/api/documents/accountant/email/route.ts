import { NextRequest, NextResponse } from "next/server";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { sendAccountantDocumentsEmail } from "@/lib/finance/accountant-email";

export const dynamic = "force-dynamic";

/**
 * POST /api/documents/accountant/email
 * שליחת PDFים מהארכיון במייל אחד (מספר נמענים, ZIP אוטומטי מעל 25MB).
 */
export async function POST(req: NextRequest) {
  const block = await requireDb();
  if (block) return block;

  const session = await getSessionFromCookie();
  if (!session?.sub) {
    return NextResponse.json({ ok: false, error: "נדרשת התחברות" }, { status: 401 });
  }

  let body: {
    documentIds?: unknown;
    to?: unknown;
    recipients?: unknown;
    subject?: unknown;
    message?: unknown;
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

  let to: string | string[] = "";
  if (Array.isArray(body.recipients)) {
    to = body.recipients.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
  } else if (typeof body.to === "string") {
    to = body.to;
  } else if (Array.isArray(body.to)) {
    to = body.to.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
  }

  const subject = typeof body.subject === "string" ? body.subject : undefined;
  const message = typeof body.message === "string" ? body.message : undefined;
  const attachmentSelection =
    body.sendMode === "pdf_only"
      ? { includePdf: true, includeSource: false }
      : body.sendMode === "source_only"
        ? { includePdf: false, includeSource: true }
        : body.sendMode === "pdf_and_source"
          ? { includePdf: true, includeSource: true }
          : {
              includePdf: body.includePdf !== false,
              includeSource: body.includeSource !== false,
            };

  if (documentIds.length === 0) {
    return NextResponse.json({ ok: false, error: "לא נבחרו מסמכים" }, { status: 400 });
  }
  const hasRecipients =
    (typeof to === "string" && to.trim().length > 0) ||
    (Array.isArray(to) && to.length > 0);
  if (!hasRecipients) {
    return NextResponse.json({ ok: false, error: "חסרה כתובת מייל" }, { status: 400 });
  }

  try {
    const result = await sendAccountantDocumentsEmail({
      documentIds,
      to,
      subject,
      message,
      sentById: session.sub,
      attachmentSelection,
    });

    if (!result.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: result.error,
          missingDocumentIds: result.missingDocumentIds,
        },
        { status: result.missingDocumentIds?.length ? 422 : 502 },
      );
    }

    return NextResponse.json({
      ok: true,
      sentCount: result.sentCount,
      recipientCount: result.recipientCount,
      zipped: result.zipped,
      resendId: result.resendId,
      message: result.message,
      attachmentCount: result.attachmentCount,
      pdfCount: result.pdfCount,
      sourceCount: result.sourceCount,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה בשליחת המייל" },
      { status: 500 },
    );
  }
}
