import { prismaAny } from "@/lib/prisma";
import { isQuietHours } from "@/lib/email/quiet-hours";
import {
  processNotificationEmail,
  type ProcessNotificationEmailOptions,
} from "@/lib/email/notification-email-pipeline";
import type { NotificationEmailPayload } from "@/lib/email/notification-bridge";

function rowToPayload(row: {
  id: string;
  recipientUserId: string;
  type: string;
  title: string;
  message: string;
  actionUrl: string | null;
  metadata: unknown;
  roleTarget: string;
  priority: string;
}): NotificationEmailPayload {
  return {
    notificationId: row.id,
    recipientUserId: row.recipientUserId,
    type: row.type,
    title: row.title,
    message: row.message,
    actionUrl: row.actionUrl,
    metadata: row.metadata,
    roleTarget: row.roleTarget as NotificationEmailPayload["roleTarget"],
  };
}

/**
 * ניסיון שליחה מחדש להתראות שנכשלו / תקועות בתור / ממתינות (שעות שקט).
 */
export async function retryFailedNotificationEmails(limit = 50): Promise<number> {
  const stuckQueuedBefore = new Date(Date.now() - 90_000);
  const maxAge = new Date(Date.now() - 7 * 86_400_000);

  const rows = (await prismaAny.notification.findMany({
    where: {
      createdAt: { gte: maxAge },
      OR: [
        { emailStatus: "failed" },
        { emailStatus: "pending" },
        { emailStatus: "queued", createdAt: { lt: stuckQueuedBefore } },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: {
      id: true,
      recipientUserId: true,
      type: true,
      title: true,
      message: true,
      actionUrl: true,
      metadata: true,
      roleTarget: true,
      priority: true,
      emailSkippedReason: true,
    },
  })) as Array<{
    id: string;
    recipientUserId: string;
    type: string;
    title: string;
    message: string;
    actionUrl: string | null;
    metadata: unknown;
    roleTarget: string;
    priority: string;
    emailSkippedReason: string | null;
  }>;

  let retried = 0;
  for (const row of rows) {
    if (row.emailSkippedReason === "quiet_hours" && isQuietHours()) {
      continue;
    }

    const options: ProcessNotificationEmailOptions = {
      forceImmediate: true,
      skipDedupe: true,
      isRetry: true,
    };
    await processNotificationEmail(rowToPayload(row), row.priority, options);
    retried += 1;
  }
  return retried;
}
