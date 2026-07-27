/**
 * שליחת התראות מערכת לנמענים הקבועים.
 *
 * זו נקודת המעבר היחידה: כל התראה שנשלחת לנמען חיצוני עוברת דרך
 * sendSystemAlertToRecipients, וכך יומן השליחות, ה־dedupe והרשאות הקטגוריה
 * מוגדרים במקום אחד.
 *
 * הנמענים הקבועים אינם משתמשי מערכת, ולכן במכוון אין החלה של העדפות מייל
 * אישיות (emailMode / quiet hours) — אלה שייכות למשתמש ולא לכתובת ביקורת.
 */
import { createHash } from "node:crypto";
import { getEmailConfig } from "@/lib/email/config";
import {
  buildEmailForNotification,
  type NotificationEmailPayload,
} from "@/lib/email/notification-bridge";
import { sendSystemEmailAwaitable } from "@/lib/email/send";
import type { SystemEmailAttachment, SystemEmailTemplate } from "@/lib/email/types";
import {
  categoryForNotificationType,
  isForwardableNotificationType,
  type SystemAlertCategory,
} from "@/lib/notifications/alert-categories";
import {
  markRecipientSent,
  resolveRecipientsForCategory,
  type ResolvedRecipient,
} from "@/lib/notifications/system-recipients";

export type SystemAlertInput = {
  category: SystemAlertCategory;
  subject: string;
  template?: SystemEmailTemplate;
  data: Record<string, unknown>;
  /** נשמר ב־EmailLog.type — כך היומן מסונן לפי סוג ההתראה */
  logType?: string;
  /** מזהה הישות (סשן ספירה / משימה / יום דוח) — נשמר ביומן לביקורת */
  entityId?: string | null;
  /** מונע כפילות לאותו אירוע. חובה כשאותו אירוע יכול להיווצר יותר מפעם אחת. */
  dedupeKey?: string;
  dedupeWindowHours?: number;
  /** שליחה יזומה מממשק ניהול — עוקפת את בדיקת הכפילות */
  skipDedupe?: boolean;
  attachments?: SystemEmailAttachment[];
};

export type SystemAlertResult = {
  category: SystemAlertCategory;
  recipientCount: number;
  sent: number;
  failed: number;
  deduped: number;
  errors: Array<{ email: string; error: string }>;
};

/** מפתח יציב וקצר לאירוע — כדי ששליחה לכמה מנהלים לא תיצור כמה מיילים */
export function alertFingerprint(...parts: Array<string | number | null | undefined>): string {
  const raw = parts.map((p) => String(p ?? "")).join("|");
  return createHash("sha1").update(raw).digest("hex").slice(0, 16);
}

export async function sendSystemAlertToRecipients(
  input: SystemAlertInput,
  /** נמענים שכבר נפתרו — מונע שאילתה כפולה כשהקורא בדק אם יש נמענים בכלל */
  preResolved?: ResolvedRecipient[],
): Promise<SystemAlertResult> {
  const result: SystemAlertResult = {
    category: input.category,
    recipientCount: 0,
    sent: 0,
    failed: 0,
    deduped: 0,
    errors: [],
  };

  const cfg = getEmailConfig();
  if (!cfg.enabled) {
    result.errors.push({ email: "-", error: "RESEND_API_KEY missing" });
    return result;
  }

  const recipients = preResolved ?? (await resolveRecipientsForCategory(input.category));
  result.recipientCount = recipients.length;
  if (recipients.length === 0) return result;

  const logType = input.logType ?? `SYS_${input.category.toUpperCase()}`;

  for (const recipient of recipients) {
    const sendResult = await sendSystemEmailAwaitable({
      to: recipient.email,
      subject: input.subject,
      template: input.template ?? "system-alert",
      data: {
        ...input.data,
        systemAlertCategory: input.category,
        ...(input.entityId ? { entityId: input.entityId } : {}),
      },
      type: logType,
      dedupeKey: input.dedupeKey,
      dedupeWindowHours: input.dedupeWindowHours,
      skipDedupe: input.skipDedupe ?? false,
      attachments: input.attachments,
    });

    if (sendResult.ok) {
      result.sent++;
      void markRecipientSent(recipient.id);
      continue;
    }
    if (sendResult.error === "deduped") {
      result.deduped++;
      continue;
    }
    result.failed++;
    result.errors.push({ email: recipient.email, error: sendResult.error ?? "send_failed" });
  }

  return result;
}

/**
 * העברת התראת משתמש קיימת גם לנמענים הקבועים.
 *
 * ההעברה עצמאית מההחלטה לגבי המשתמש: התראה שנחסמה בגלל העדפות אישיות, שעות
 * שקט או משתמש לא פעיל עדיין מגיעה לנמען הקבוע — זו כל המטרה של הרשימה.
 *
 * נקראת פעם אחת לכל שורת Notification, כלומר גם כשאותו אירוע נרשם לכמה מנהלים;
 * ה־dedupeKey מבוסס על תוכן האירוע ולא על מזהה ההתראה, ולכן הנמען החיצוני מקבל
 * מייל אחד לאירוע.
 */
export async function forwardNotificationToSystemRecipients(
  payload: NotificationEmailPayload,
): Promise<SystemAlertResult | null> {
  if (!isForwardableNotificationType(payload.type)) return null;

  // כיבוד סימון מפורש של המפיק "לא לשלוח מייל" (למשל סריקה שהצליחה)
  const meta = (payload.metadata ?? {}) as Record<string, unknown>;
  if (meta.emailImportance === "NONE") return null;

  const category = categoryForNotificationType(payload.type);
  const recipients = await resolveRecipientsForCategory(category);
  if (recipients.length === 0) return null;

  const built = await buildEmailForNotification(payload, "");
  if (!built) return null;

  return sendSystemAlertToRecipients(
    {
      category,
      subject: built.subject,
      template: built.template,
      data: built.data,
      logType: payload.type,
      entityId: payload.notificationId,
      dedupeKey: `notif:${payload.type}:${alertFingerprint(payload.title, payload.message)}`,
      dedupeWindowHours: 12,
    },
    recipients,
  );
}

/** מונע לופ: כשל בשליחת התראת כשל לא ייצור התראת כשל נוספת */
let reportingFailure = false;

/**
 * דיווח תקלה תשתיתית לנמענים הקבועים (cron, גיבוי, מייל, PDF, שרת, אינטגרציה).
 * לא זורקת לעולם — מיועדת לקריאה מתוך catch.
 */
export async function reportSystemFailure(params: {
  category: Extract<
    SystemAlertCategory,
    | "cronFailure"
    | "backupFailure"
    | "emailFailure"
    | "pdfFailure"
    | "serverError"
    | "integrationFailure"
    | "systemCritical"
  >;
  title: string;
  message: string;
  entityId?: string | null;
  /** חלון השקטה — כדי שתקלה חוזרת לא תמלא את תיבת המייל. ברירת מחדל שעה. */
  dedupeWindowHours?: number;
}): Promise<void> {
  if (reportingFailure) return;
  reportingFailure = true;
  try {
    const { appUrl } = getEmailConfig();
    await sendSystemAlertToRecipients({
      category: params.category,
      subject: `⚠️ ${params.title}`,
      template: "system-alert",
      data: {
        appUrl,
        title: params.title,
        message: params.message,
        actionUrl: `${appUrl}/admin/system`,
      },
      logType: `SYS_${params.category.toUpperCase()}`,
      entityId: params.entityId ?? null,
      dedupeKey: `failure:${params.category}:${alertFingerprint(params.title, params.message)}`,
      dedupeWindowHours: params.dedupeWindowHours ?? 1,
    });
  } catch {
    // דיווח תקלות לא יכול להיות מקור לתקלה
  } finally {
    reportingFailure = false;
  }
}

/** גרסה שלא ממתינה — לשימוש מתוך catch של route */
export function reportSystemFailureAsync(
  params: Parameters<typeof reportSystemFailure>[0],
): void {
  void reportSystemFailure(params).catch(() => {});
}
