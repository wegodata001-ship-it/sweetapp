import { getEmailConfig } from "@/lib/email/config";
import { sendSystemEmailAwaitable } from "@/lib/email/send";
import { emailImportanceMeetsThreshold, type EmailImportance } from "@/lib/email/importance";
import { prismaAny } from "@/lib/prisma";

const BATCH_MS = 60_000;

type BatchItem = {
  notificationId: string;
  type: string;
  title: string;
  message: string;
  importance: EmailImportance;
};

type UserBatch = {
  userId: string;
  email: string;
  items: BatchItem[];
  timer: ReturnType<typeof setTimeout> | null;
};

const batches = new Map<string, UserBatch>();

function batchKey(userId: string): string {
  return userId;
}

async function flushBatch(key: string): Promise<void> {
  const batch = batches.get(key);
  if (!batch || batch.items.length === 0) {
    batches.delete(key);
    return;
  }

  const items = [...batch.items];
  batches.delete(key);

  const { appUrl } = getEmailConfig();
  const count = items.length;
  const lines = items
    .slice(0, 8)
    .map((it) => `• ${it.title}`)
    .join("\n");
  const more = count > 8 ? `\n… ועוד ${count - 8} התראות` : "";

  const result = await sendSystemEmailAwaitable({
    to: batch.email,
    subject: `יש לך ${count} עדכונים חדשים במערכת`,
    template: "new-update",
    type: "EMAIL_DIGEST",
    skipDedupe: true,
    userId: batch.userId,
    data: {
      appUrl,
      title: `${count} התראות חדשות`,
      body: `${lines}${more}`,
      actionUrl: appUrl,
    },
  });

  const status = result.ok ? "sent" : "failed";
  const sentAt = result.ok ? new Date() : null;
  for (const it of items) {
    try {
      await prismaAny.notification.update({
        where: { id: it.notificationId },
        data: {
          emailStatus: result.ok ? "batched" : "failed",
          emailSentAt: sentAt,
          emailSkippedReason: result.ok ? null : result.error ?? "batch_send_failed",
        },
      });
    } catch {
      /* ignore */
    }
  }

  if (!result.ok) {
    console.error("[EMAIL BATCH FAILED]", result.error);
  }
}

/**
 * תור התראות לסיכום — HIGH/CRITICAL נשלחים מיד (מחוץ לפונקציה זו).
 */
export function queueEmailBatch(params: {
  userId: string;
  email: string;
  item: BatchItem;
  dailyDigest?: boolean;
}): void {
  const key = batchKey(params.userId);
  let batch = batches.get(key);
  if (!batch) {
    batch = { userId: params.userId, email: params.email, items: [], timer: null };
    batches.set(key, batch);
  }

  batch.items.push(params.item);
  if (batch.timer) clearTimeout(batch.timer);

  const delay = params.dailyDigest ? 5 * 60_000 : BATCH_MS;
  batch.timer = setTimeout(() => {
    void flushBatch(key);
  }, delay);
}

export function shouldBatchEmail(
  importance: EmailImportance,
  emailMode: string,
  notificationType?: string,
): boolean {
  if (importance === "CRITICAL" || importance === "HIGH") return false;
  if (notificationType === "TASK_ASSIGNED") return false;
  if (emailMode === "daily_digest") return true;
  return importance === "NORMAL";
}
