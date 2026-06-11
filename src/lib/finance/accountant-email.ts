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
  downloadSourceDocumentFromStorage,
  getSourceDocumentForFinancialDoc,
} from "@/lib/finance/source-documents";
import { parsePayload } from "@/lib/finance/document-payload";
import type { DocumentEmailAttachmentSelection } from "@/lib/finance/accountant-email-attachments";
import {
  shouldZipAttachments,
  zipDocumentAttachments,
} from "@/lib/finance/accountant-email-zip";

const DEFAULT_SUBJECT = "מסמכים מ-WEGO ERP";

export type AccountantEmailAttachment = {
  documentId: string;
  fileName: string;
  buffer: Buffer;
  kind?: "pdf" | "source";
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
    kind: "pdf",
  };
}

export async function resolveArchivedSourceForDocument(
  documentId: string,
): Promise<AccountantEmailAttachment | null> {
  const upload = await getSourceDocumentForFinancialDoc(documentId);
  if (upload?.storagePath?.trim()) {
    const buffer = await downloadSourceDocumentFromStorage({
      storagePath: upload.storagePath,
      storageBucket: upload.storageBucket,
    });
    if (buffer) {
      return {
        documentId,
        fileName: upload.fileName?.trim() || `source_${documentId.slice(0, 8)}`,
        buffer,
        kind: "source",
      };
    }
  }

  const doc = await prisma.financialDocument.findUnique({
    where: { id: documentId },
    select: { metadata: true, title: true, id: true },
  });
  const payload = doc?.metadata ? parsePayload(doc.metadata as unknown) : null;
  if (!payload || payload.kind === "zreport") return null;

  const storagePath = payload.receiptStoragePath?.trim();
  if (!storagePath) return null;

  const buffer = await downloadSourceDocumentFromStorage({
    storagePath,
    storageBucket: payload.receiptStorageBucket?.trim() || "",
  });
  if (!buffer) return null;

  const fileName =
    payload.receiptFileName?.trim() ||
    `${doc?.title || "source"}_${documentId.slice(0, 8)}`;

  return {
    documentId,
    fileName,
    buffer,
    kind: "source",
  };
}

async function resolveAttachmentsForDocument(
  documentId: string,
  selection: DocumentEmailAttachmentSelection,
): Promise<AccountantEmailAttachment[]> {
  const [pdf, source] = await Promise.all([
    resolveArchivedPdfForDocument(documentId),
    resolveArchivedSourceForDocument(documentId),
  ]);

  const selected: AccountantEmailAttachment[] = [];
  if (selection.includePdf && pdf) selected.push(pdf);
  if (selection.includeSource && source) selected.push(source);
  if (selected.length > 0) return selected;

  if (pdf) return [pdf];
  if (source) return [source];
  return [];
}

function buildEmailHtml(params: {
  message?: string;
  documentsCount: number;
  attachmentMode: "files" | "zip";
  attachmentCount: number;
  pdfCount: number;
  sourceCount: number;
}): string {
  const parts: string[] = [];
  if (params.pdfCount > 0) {
    parts.push(`${params.pdfCount} קבצי PDF`);
  }
  if (params.sourceCount > 0) {
    parts.push(`${params.sourceCount} קבצי מקור`);
  }
  const breakdown = parts.length ? parts.join(" ו-") : `${params.attachmentCount} קבצים`;
  const attachmentLine =
    params.attachmentMode === "zip"
      ? `מצורף קובץ ZIP עם ${breakdown} מ־WEGO ERP (${params.documentsCount} מסמכים).`
      : `מצורפים ${breakdown} מ־WEGO ERP (${params.documentsCount} מסמכים).`;
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
  attachmentSelection?: DocumentEmailAttachmentSelection;
}): Promise<
  | {
      ok: true;
      sentCount: number;
      recipientCount: number;
      resendId?: string;
      zipped: boolean;
      message: string;
      attachmentCount: number;
      pdfCount: number;
      sourceCount: number;
    }
  | { ok: false; error: string; missingDocumentIds?: string[] }
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

  const selection: DocumentEmailAttachmentSelection = {
    includePdf: params.attachmentSelection?.includePdf ?? true,
    includeSource: params.attachmentSelection?.includeSource ?? true,
  };
  if (!selection.includePdf && !selection.includeSource) {
    return { ok: false, error: "יש לבחור לפחות סוג קובץ אחד לשליחה" };
  }

  const attachments: AccountantEmailAttachment[] = [];
  const missingDocumentIds: string[] = [];
  const sentDocumentIds = new Set<string>();

  for (const documentId of uniqueIds) {
    const files = await resolveAttachmentsForDocument(documentId, selection);
    if (files.length === 0) {
      missingDocumentIds.push(documentId);
      continue;
    }
    attachments.push(...files);
    sentDocumentIds.add(documentId);
  }

  if (attachments.length === 0) {
    return {
      ok: false,
      error:
        uniqueIds.length === 1
          ? "לא נמצאו קבצים לשליחה עבור המסמך."
          : "לא נמצאו קבצים לשליחה עבור המסמכים.",
      missingDocumentIds,
    };
  }

  if (missingDocumentIds.length > 0) {
    return {
      ok: false,
      error: "לא נמצאו קבצים לשליחה עבור חלק מהמסמכים.",
      missingDocumentIds,
    };
  }

  const pdfCount = attachments.filter((a) => a.kind === "pdf").length;
  const sourceCount = attachments.filter((a) => a.kind === "source").length;

  const zipped = shouldZipAttachments(attachments);
  const attachmentMode: "files" | "zip" = zipped ? "zip" : "files";

  let emailAttachments: { filename: string; content: Buffer }[];
  if (zipped) {
    const zip = await zipDocumentAttachments(attachments);
    emailAttachments = [{ filename: zip.fileName, content: zip.buffer }];
  } else {
    emailAttachments = attachments.map((file) => ({ filename: file.fileName, content: file.buffer }));
  }

  const subject = params.subject?.trim() || DEFAULT_SUBJECT;
  const html = buildEmailHtml({
    message: params.message,
    documentsCount: sentDocumentIds.size,
    attachmentMode,
    attachmentCount: emailAttachments.length,
    pdfCount,
    sourceCount,
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
  const sentDocumentIdList = [...sentDocumentIds];
  const recipientEmailsJoined = recipients.join(", ");
  const batchId = randomUUID();

  await persistAccountantEmailSend({
    sentDocumentIds: sentDocumentIdList,
    sentAt,
    recipientEmailsJoined,
    sentById: params.sentById,
    attachmentsCount: attachments.length,
    documentsCount: sentDocumentIdList.length,
    attachmentMode,
    batchId,
    subject,
    message: params.message?.trim() || null,
    resendId: result.data?.id ?? null,
    recipients,
  });

  const successMessage =
    sentDocumentIdList.length === 1 && recipients.length === 1
      ? "המייל נשלח בהצלחה"
      : `המייל נשלח בהצלחה — ${sentDocumentIdList.length} מסמכים ל-${recipients.length} נמענים`;

  return {
    ok: true,
    sentCount: sentDocumentIdList.length,
    recipientCount: recipients.length,
    resendId: result.data?.id,
    zipped,
    message: successMessage,
    attachmentCount: attachments.length,
    pdfCount,
    sourceCount,
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
