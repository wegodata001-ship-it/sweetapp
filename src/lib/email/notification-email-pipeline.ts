import { prisma, prismaAny } from "@/lib/prisma";
import { getEmailConfig, isDeliverableEmail } from "@/lib/email/config";
import { resolveEmailImportance } from "@/lib/email/importance";
import { evaluateNotificationEmail } from "@/lib/email/rules";
import { queueEmailBatch, shouldBatchEmail } from "@/lib/email/batching";
import {
  buildEmailForNotification,
  type NotificationEmailPayload,
} from "@/lib/email/notification-bridge";
import { sendSystemEmailAwaitable } from "@/lib/email/send";
import { getUserEmailPreferences } from "@/lib/email/preferences";
import { logEmailError, logEmailFailed, logEmailSending, logEmailSkipped } from "@/lib/email/audit";
import { resolveOutboundEmail } from "@/lib/email/test-config";
import type { NotificationPriorityLevel } from "@/lib/notifications/priority";
import { isManagerRole } from "@/lib/notifications/me-inbox";

export type ProcessNotificationEmailOptions = {
  /** דילוג על אצווה — שליחה מיידית (retry / cron) */
  forceImmediate?: boolean;
  skipDedupe?: boolean;
  isRetry?: boolean;
};

async function patchNotificationEmailState(
  notificationId: string,
  patch: {
    emailImportance?: string;
    emailStatus?: string;
    emailSkippedReason?: string | null;
    emailSentAt?: Date | null;
  },
): Promise<void> {
  try {
    await prismaAny.notification.update({
      where: { id: notificationId },
      data: patch,
    });
  } catch (e) {
    logEmailError({
      step: "patch_notification",
      notificationId,
      error: String(e),
    });
  }
}

export async function processNotificationEmail(
  payload: NotificationEmailPayload,
  priority?: NotificationPriorityLevel | string | null,
  options: ProcessNotificationEmailOptions = {},
): Promise<void> {
  const cfg = getEmailConfig();

  logEmailSending({
    notificationId: payload.notificationId,
    userId: payload.recipientUserId,
    type: payload.type,
    subject: payload.title,
    provider: "resend",
    status: "PENDING",
    isRetry: options.isRetry ?? false,
  });

  if (!cfg.enabled) {
    await patchNotificationEmailState(payload.notificationId, {
      emailStatus: "failed",
      emailSkippedReason: "RESEND_API_KEY missing",
    });
    logEmailFailed({
      notificationId: payload.notificationId,
      userId: payload.recipientUserId,
      reason: "RESEND_API_KEY missing",
      provider: "resend",
    });
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.recipientUserId },
    select: { id: true, email: true, role: true, isActive: true },
  });

  if (!user?.isActive) {
    await patchNotificationEmailState(payload.notificationId, {
      emailStatus: "skipped",
      emailSkippedReason: "user_inactive",
    });
    logEmailSkipped({
      notificationId: payload.notificationId,
      userId: payload.recipientUserId,
      reason: "user_inactive",
    });
    return;
  }

  const outbound = resolveOutboundEmail(user.email);
  if (!outbound || !isDeliverableEmail(outbound)) {
    await patchNotificationEmailState(payload.notificationId, {
      emailStatus: "skipped",
      emailSkippedReason: "no_deliverable_email",
    });
    logEmailSkipped({
      notificationId: payload.notificationId,
      userId: user.id,
      email: user.email,
      reason: "no_deliverable_email",
    });
    return;
  }

  const meta = (payload.metadata ?? {}) as Record<string, unknown>;
  const importance = resolveEmailImportance({
    type: payload.type,
    priority,
    roleTarget: payload.roleTarget,
    metadata: meta,
  });

  await patchNotificationEmailState(payload.notificationId, {
    emailImportance: importance,
  });

  const decision = await evaluateNotificationEmail(
    user.id,
    user.role,
    payload,
    priority,
  );

  if (!decision.send) {
    if (decision.reason === "quiet_hours") {
      await patchNotificationEmailState(payload.notificationId, {
        emailImportance: decision.importance,
        emailStatus: "pending",
        emailSkippedReason: "quiet_hours",
      });
      logEmailSkipped({
        notificationId: payload.notificationId,
        userId: user.id,
        to: outbound,
        reason: "quiet_hours — יישלח מחדש אוטומטית",
      });
      return;
    }

    await patchNotificationEmailState(payload.notificationId, {
      emailImportance: decision.importance,
      emailStatus: "skipped",
      emailSkippedReason: decision.reason,
    });
    logEmailSkipped({
      notificationId: payload.notificationId,
      userId: user.id,
      to: outbound,
      reason: decision.reason,
    });
    return;
  }

  const prefs = await getUserEmailPreferences(user.id);
  const to = outbound;

  if (
    !options.forceImmediate &&
    shouldBatchEmail(decision.importance, prefs.emailMode, payload.type)
  ) {
    await patchNotificationEmailState(payload.notificationId, {
      emailImportance: decision.importance,
      emailStatus: "queued",
      emailSkippedReason: "batched",
    });
    queueEmailBatch({
      userId: user.id,
      email: to,
      dailyDigest: prefs.emailMode === "daily_digest",
      item: {
        notificationId: payload.notificationId,
        type: payload.type,
        title: payload.title,
        message: payload.message,
        importance: decision.importance,
      },
    });
    logEmailSending({
      notificationId: payload.notificationId,
      userId: user.id,
      to,
      status: "PENDING",
      reason: "queued_for_digest",
    });
    return;
  }

  const built = await buildEmailForNotification(payload, to);
  if (!built) {
    await patchNotificationEmailState(payload.notificationId, {
      emailStatus: "failed",
      emailSkippedReason: "no_template",
    });
    logEmailFailed({
      notificationId: payload.notificationId,
      userId: user.id,
      to,
      reason: "no_template",
    });
    return;
  }

  logEmailSending({
    notificationId: payload.notificationId,
    userId: user.id,
    to,
    subject: built.subject,
    type: payload.type,
    provider: "resend",
  });

  const result = await sendSystemEmailAwaitable({
    to,
    subject: built.subject,
    template: built.template,
    data: built.data,
    userId: user.id,
    notificationId: payload.notificationId,
    type: payload.type,
    skipDedupe: options.skipDedupe ?? false,
  });

  await patchNotificationEmailState(payload.notificationId, {
    emailImportance: decision.importance,
    emailStatus: result.ok ? "sent" : "failed",
    emailSentAt: result.ok ? new Date() : null,
    emailSkippedReason: result.ok ? null : result.error ?? "send_failed",
  });

  if (!result.ok) {
    logEmailFailed({
      notificationId: payload.notificationId,
      recipientUserId: user.id,
      to,
      subject: built.subject,
      type: payload.type,
      role: isManagerRole(user.role) ? "admin" : "employee",
      reason: result.error ?? "send_failed",
      logId: result.logId,
    });
  }
}

export function scheduleNotificationEmail(
  payload: NotificationEmailPayload,
  priority?: NotificationPriorityLevel | string | null,
): void {
  void processNotificationEmail(payload, priority).catch((e) => {
    logEmailError({
      notificationId: payload.notificationId,
      error: String(e),
    });
    void patchNotificationEmailState(payload.notificationId, {
      emailStatus: "failed",
      emailSkippedReason: String(e),
    });
  });
}
