import { prisma, prismaAny } from "@/lib/prisma";
import { isDeliverableEmail } from "@/lib/email/config";
import { resolveEmailImportance } from "@/lib/email/importance";
import { evaluateNotificationEmail } from "@/lib/email/rules";
import { queueEmailBatch, shouldBatchEmail } from "@/lib/email/batching";
import {
  buildEmailForNotification,
  type NotificationEmailPayload,
} from "@/lib/email/notification-bridge";
import { sendSystemEmailAwaitable } from "@/lib/email/send";
import { getUserEmailPreferences } from "@/lib/email/preferences";
import { logEmailError } from "@/lib/email/audit";
import type { NotificationPriorityLevel } from "@/lib/notifications/priority";
import { isManagerRole } from "@/lib/notifications/me-inbox";

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
  } catch {
    /* עמודות עדיין לא במיגרציה */
  }
}

export async function processNotificationEmail(
  payload: NotificationEmailPayload,
  priority?: NotificationPriorityLevel | string | null,
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: payload.recipientUserId },
    select: { id: true, email: true, role: true, isActive: true },
  });

  if (!user?.isActive) {
    await patchNotificationEmailState(payload.notificationId, {
      emailStatus: "skipped",
      emailSkippedReason: "user_inactive",
    });
    return;
  }

  if (!isDeliverableEmail(user.email)) {
    await patchNotificationEmailState(payload.notificationId, {
      emailStatus: "skipped",
      emailSkippedReason: "no_deliverable_email",
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
    await patchNotificationEmailState(payload.notificationId, {
      emailImportance: decision.importance,
      emailStatus: "skipped",
      emailSkippedReason: decision.reason,
    });
    return;
  }

  const prefs = await getUserEmailPreferences(user.id);
  const to = user.email.trim().toLowerCase();

  if (shouldBatchEmail(decision.importance, prefs.emailMode, payload.type)) {
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
    return;
  }

  const built = await buildEmailForNotification(payload, to);
  if (!built) {
    await patchNotificationEmailState(payload.notificationId, {
      emailStatus: "skipped",
      emailSkippedReason: "no_template",
    });
    return;
  }

  const result = await sendSystemEmailAwaitable({
    to,
    subject: built.subject,
    template: built.template,
    data: built.data,
    userId: user.id,
    notificationId: payload.notificationId,
    type: payload.type,
  });

  await patchNotificationEmailState(payload.notificationId, {
    emailImportance: decision.importance,
    emailStatus: result.ok ? "sent" : "failed",
    emailSentAt: result.ok ? new Date() : null,
    emailSkippedReason: result.ok ? null : result.error ?? "send_failed",
  });

  if (!result.ok) {
    logEmailError({
      notificationId: payload.notificationId,
      recipientUserId: user.id,
      role: isManagerRole(user.role) ? "admin" : "employee",
      error: result.error,
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
  });
}
