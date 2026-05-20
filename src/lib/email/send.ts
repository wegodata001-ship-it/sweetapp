import { Resend } from "resend";
import { prismaAny } from "@/lib/prisma";
import { getEmailConfig, isDeliverableEmail } from "@/lib/email/config";
import { renderSystemEmail } from "@/lib/email/templates/render-template";
import { hasRecentEmailLog } from "@/lib/email/dedupe";
import {
  logEmailError,
  logEmailFailed,
  logEmailRetry,
  logEmailSent,
} from "@/lib/email/audit";
import type { EmailSendResult, SendSystemEmailInput } from "@/lib/email/types";

const MAX_ATTEMPTS = 3;

async function createEmailLogPending(input: SendSystemEmailInput): Promise<string | null> {
  try {
    const row = await prismaAny.emailLog.create({
      data: {
        recipient: input.to.toLowerCase(),
        subject: input.subject,
        type: input.type ?? input.template,
        status: "pending",
        userId: input.userId ?? null,
        notificationId: input.notificationId ?? null,
        metadata: {
          template: input.template,
          priority: input.priority ?? "MEDIUM",
          renderData: input.data,
        },
      },
      select: { id: true },
    });
    return row.id as string;
  } catch (e) {
    logEmailError({ step: "create_log", error: String(e) });
    return null;
  }
}

async function updateEmailLog(
  id: string | null,
  patch: { status: string; error?: string | null; sentAt?: Date | null },
): Promise<void> {
  if (!id) return;
  try {
    await prismaAny.emailLog.update({
      where: { id },
      data: patch,
    });
  } catch (e) {
    logEmailError({ step: "update_log", id, error: String(e) });
  }
}

async function sendViaResend(input: SendSystemEmailInput, html: string): Promise<{ ok: true; id?: string } | { ok: false; error: string }> {
  const cfg = getEmailConfig();
  if (!cfg.enabled || !cfg.apiKey) {
    return { ok: false, error: "RESEND_API_KEY missing" };
  }

  const resend = new Resend(cfg.apiKey);
  const result = await resend.emails.send({
    from: cfg.from,
    to: [input.to],
    subject: input.subject,
    html,
  });

  if (result.error) {
    return { ok: false, error: result.error.message };
  }
  return { ok: true, id: result.data?.id };
}

async function sendSystemEmailAsync(input: SendSystemEmailInput): Promise<EmailSendResult> {
  const to = input.to.trim().toLowerCase();
  if (!isDeliverableEmail(to)) {
    logEmailFailed({ reason: "undeliverable", to, type: input.type });
    return { ok: false, error: "undeliverable email" };
  }

  if (!input.skipDedupe) {
    const dup = await hasRecentEmailLog({
      userId: input.userId,
      recipient: to,
      type: input.type ?? input.template,
      notificationId: input.notificationId,
      entityKey: typeof input.data.entityKey === "string" ? input.data.entityKey : undefined,
      entityValue:
        input.data.entityValue != null ? String(input.data.entityValue) : undefined,
      sinceHours: 24,
    });
    if (dup) {
      logEmailFailed({ reason: "deduped", to, type: input.type });
      return { ok: false, error: "deduped" };
    }
  }

  const logId = await createEmailLogPending(input);
  let html: string;
  try {
    html = await renderSystemEmail(input.template, input.data);
  } catch (e) {
    await updateEmailLog(logId, { status: "failed", error: `render: ${String(e)}` });
    logEmailFailed({ to, template: input.template, error: String(e) });
    return { ok: false, error: String(e), logId };
  }

  let lastError = "";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (attempt > 1) {
      logEmailRetry({ to, attempt, type: input.type });
      await new Promise((r) => setTimeout(r, attempt * 400));
    }

    const sent = await sendViaResend(input, html);
    if (sent.ok) {
      await updateEmailLog(logId, { status: "sent", error: null, sentAt: new Date() });
      logEmailSent({
        to,
        subject: input.subject,
        type: input.type,
        template: input.template,
        notificationId: input.notificationId,
        resendId: sent.id,
      });
      return { ok: true, logId, resendId: sent.id };
    }
    lastError = sent.error;
  }

  await updateEmailLog(logId, { status: "failed", error: lastError });
  logEmailFailed({ to, subject: input.subject, type: input.type, error: lastError });
  return { ok: false, error: lastError, logId };
}

/** שליחה סינכרונית — לבדיקות API / QA */
export async function sendSystemEmailAwaitable(input: SendSystemEmailInput): Promise<EmailSendResult> {
  try {
    return await sendSystemEmailAsync(input);
  } catch (e) {
    logEmailError({ subject: input.subject, to: input.to, error: String(e) });
    return { ok: false, error: String(e) };
  }
}

/**
 * שליחת מייל מערכת — לא חוסם את זרימת ההתראות.
 */
export function sendSystemEmail(input: SendSystemEmailInput): void {
  void sendSystemEmailAsync(input).catch((e) => {
    logEmailError({ subject: input.subject, to: input.to, error: String(e) });
  });
}

/** שליחה מחדש מדף ניהול (מחזיר תוצאה) */
export async function resendEmailFromLog(logId: string): Promise<{ ok: boolean; error?: string }> {
  const log = (await prismaAny.emailLog.findUnique({
    where: { id: logId },
  })) as {
    id: string;
    recipient: string;
    subject: string;
    type: string;
    userId: string | null;
    notificationId: string | null;
    metadata: unknown;
  } | null;

  if (!log) return { ok: false, error: "לא נמצא" };

  const meta = (log.metadata ?? {}) as Record<string, unknown>;
  const template = String(meta.template ?? "system-alert") as SendSystemEmailInput["template"];
  const data = (meta.renderData ?? meta) as Record<string, unknown>;

  const result = await sendSystemEmailAwaitable({
    to: log.recipient,
    subject: log.subject,
    template,
    data,
    userId: log.userId ?? undefined,
    notificationId: log.notificationId ?? undefined,
    type: log.type,
    skipDedupe: true,
  });
  return { ok: result.ok, error: result.error };
}
