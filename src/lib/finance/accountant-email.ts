import { randomUUID } from "crypto";
import { Resend } from "resend";
import { prisma } from "@/lib/prisma";
import { prismaAny } from "@/lib/prisma";
import { getEmailConfig, isDeliverableEmail } from "@/lib/email/config";
import { downloadReportFromStorage } from "@/lib/storage/downloadReport";
import { logActivity } from "@/lib/activity-log";
import { touchDocumentEmailContacts } from "@/lib/finance/document-email-contacts";
import { normalizeContactEmail } from "@/lib/finance/document-email-business";
import {
  shouldZipAttachments,
  zipDocumentAttachments,
} from "@/lib/finance/accountant-email-zip";

const DEFAULT_SUBJECT = "מסמכים מ-WEGO ERP";

export type AccountantEmailAttachment = {
  documentId: string;
  fileName: string;
  buffer: Buffer;
};

export async function resolveArchivedPdfForDocument(
  documentId: string,
): Promise<AccountantEmailAttachment | null> {
  const report = await prisma.generatedReport.findFirst({
    where: { relatedId: documentId },
    orderBy: { createdAt: "desc" },
    select: { fileName: true, filePath: true },
  });

  let filePath = report?.filePath?.trim() ?? "";
  let fileName = report?.fileName?.trim() ?? "";

  if (!filePath) {
    const doc = await prisma.financialDocument.findUnique({
      where: { id: documentId },
      select: { pdfStoragePath: true, title: true, id: true },
    });
    filePath = doc?.pdfStoragePath?.trim() ?? "";
    if (!fileName && doc) {
      fileName = `${doc.title || "document"}_${doc.id.slice(0, 8)}.pdf`;
    }
  }

  if (!filePath) return null;

  const buffer = await downloadReportFromStorage(filePath);
  if (!buffer) return null;

  return {
    documentId,
    fileName: fileName || `document_${documentId.slice(0, 8)}.pdf`,
    buffer,
  };
}

function buildEmailHtml(params: {
  message?: string;
  documentsCount: number;
  attachmentMode: "files" | "zip";
  attachmentCount: number;
}): string {
  const attachmentLine =
    params.attachmentMode === "zip"
      ? `מצורף קובץ ZIP עם ${params.documentsCount} מסמכי PDF מ־WEGO ERP.`
      : `מצורפים ${params.attachmentCount} קבצי PDF מ־WEGO ERP.`;
  const intro = `<p style="margin:0 0 12px;font-family:Arial,sans-serif;font-size:14px;color:#0f172a;">${attachmentLine}</p>`;
  const body = params.message?.trim()
    ? `<p style="margin:0 0 12px;font-family:Arial,sans-serif;font-size:14px;color:#334155;white-space:pre-wrap;">${escapeHtml(params.message.trim())}</p>`
    : "";
  return `<div dir="rtl" style="padding:8px 0;">${body}${intro}</div>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function normalizeRecipients(raw: string | string[]): string[] {
  const list = Array.isArray(raw) ? raw : [raw];
  const out: string[] = [];
  for (const item of list) {
    for (const part of item.split(/[,;\s]+/)) {
      const email = normalizeContactEmail(part);
      if (email && isDeliverableEmail(email) && !out.includes(email)) {
        out.push(email);
      }
    }
  }
  return out;
}

export async function sendAccountantDocumentsEmail(params: {
  documentIds: string[];
  to: string | string[];
  subject?: string;
  message?: string;
  sentById: string;
}): Promise<
  | {
      ok: true;
      sentCount: number;
      recipientCount: number;
      resendId?: string;
      zipped: boolean;
      message: string;
    }
  | { ok: false; error: string; missingPdfDocumentIds?: string[] }
> {
  const recipients = normalizeRecipients(params.to);
  if (recipients.length === 0) {
    return { ok: false, error: "לא נמצאו כתובות מייל תקינות" };
  }

  const uniqueIds = [...new Set(params.documentIds.filter(Boolean))];
  if (uniqueIds.length === 0) {
    return { ok: false, error: "לא נבחרו מסמכים" };
  }

  const cfg = getEmailConfig();
  if (!cfg.enabled || !cfg.apiKey) {
    return { ok: false, error: "שירות המייל אינו מוגדר (Resend)" };
  }

  const attachments: AccountantEmailAttachment[] = [];
  const missingPdfDocumentIds: string[] = [];

  for (const documentId of uniqueIds) {
    const file = await resolveArchivedPdfForDocument(documentId);
    if (!file) {
      missingPdfDocumentIds.push(documentId);
      continue;
    }
    attachments.push(file);
  }

  if (attachments.length === 0) {
    return {
      ok: false,
      error: "לא נמצאו קבצי PDF בארכיון למסמכים שנבחרו",
      missingPdfDocumentIds,
    };
  }

  if (missingPdfDocumentIds.length > 0) {
    return {
      ok: false,
      error: "חלק מהמסמכים ללא PDF בארכיון — הפיקו PDF לפני שליחה",
      missingPdfDocumentIds,
    };
  }

  const zipped = shouldZipAttachments(attachments);
  const attachmentMode: "files" | "zip" = zipped ? "zip" : "files";

  const emailAttachments: { filename: string; content: Buffer }[] = zipped
    ? [await zipDocumentAttachments(attachments)]
    : attachments.map((file) => ({ filename: file.fileName, content: file.buffer }));

  const subject = params.subject?.trim() || DEFAULT_SUBJECT;
  const html = buildEmailHtml({
    message: params.message,
    documentsCount: attachments.length,
    attachmentMode,
    attachmentCount: emailAttachments.length,
  });

  const resend = new Resend(cfg.apiKey);
  const result = await resend.emails.send({
    from: cfg.from,
    to: recipients,
    subject,
    html,
    attachments: emailAttachments.map((file) => ({
      filename: file.filename,
      content: file.content,
    })),
  });

  if (result.error) {
    return { ok: false, error: result.error.message || "שליחת המייל נכשלה" };
  }

  const sentAt = new Date();
  const sentDocumentIds = attachments.map((a) => a.documentId);
  const recipientEmailsJoined = recipients.join(", ");
  const batchId = randomUUID();

  await persistAccountantEmailSend({
    sentDocumentIds,
    sentAt,
    recipientEmailsJoined,
    sentById: params.sentById,
    attachmentsCount: emailAttachments.length,
    documentsCount: sentDocumentIds.length,
    attachmentMode,
    batchId,
    subject,
    message: params.message?.trim() || null,
    resendId: result.data?.id ?? null,
    recipients,
  });

  const successMessage =
    sentDocumentIds.length === 1 && recipients.length === 1
      ? "המייל נשלח בהצלחה"
      : `המייל נשלח בהצלחה — ${sentDocumentIds.length} מסמכים ל-${recipients.length} נמענים`;

  return {
    ok: true,
    sentCount: sentDocumentIds.length,
    recipientCount: recipients.length,
    resendId: result.data?.id,
    zipped,
    message: successMessage,
  };
}

type PersistAccountantEmailSendParams = {
  sentDocumentIds: string[];
  sentAt: Date;
  recipientEmailsJoined: string;
  sentById: string;
  attachmentsCount: number;
  documentsCount: number;
  attachmentMode: "files" | "zip";
  batchId: string;
  subject: string;
  message: string | null;
  resendId: string | null;
  recipients: string[];
};

/** Post-send persistence — never throws; email was already sent. */
async function persistAccountantEmailSend(params: PersistAccountantEmailSendParams): Promise<void> {
  const {
    sentDocumentIds,
    sentAt,
    recipientEmailsJoined,
    sentById,
    attachmentsCount,
    documentsCount,
    attachmentMode,
    batchId,
    subject,
    message,
    resendId,
    recipients,
  } = params;

  try {
    await prismaAny.financialDocument.updateMany({
      where: { id: { in: sentDocumentIds } },
      data: {
        sentToCpa: true,
        sentToCpaAt: sentAt,
        sentToCpaById: sentById,
        sentToCpaEmail: recipientEmailsJoined,
      },
    });
  } catch (e) {
    console.error("[accountant-email] document status update failed", e);
  }

  const baseLogRows = sentDocumentIds.map((documentId) => ({
    documentId,
    sentAt,
    sentTo: recipientEmailsJoined,
    sentById,
    attachmentsCount,
    subject,
    message,
    resendId,
  }));

  try {
    await prisma.accountantEmailLog.createMany({
      data: baseLogRows.map((row) => ({
        ...row,
        documentsCount,
        attachmentMode,
        batchId,
      })),
    });
  } catch (e) {
    console.error("[accountant-email] extended log save failed, retrying minimal fields", e);
    try {
      await prisma.accountantEmailLog.createMany({ data: baseLogRows });
    } catch (e2) {
      console.error("[accountant-email] log save failed", e2);
    }
  }

  try {
    await touchDocumentEmailContacts(recipients);
  } catch (e) {
    console.error("[accountant-email] contact touch failed", e);
  }

  try {
    await logActivity(sentById, "document_accountant_email_sent");
  } catch (e) {
    console.error("[accountant-email] activity log failed", e);
  }
}
