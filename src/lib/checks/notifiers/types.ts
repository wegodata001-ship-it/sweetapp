import type { CheckNotificationKind } from "@/lib/checks/types";

/**
 * אפיק שליחת התראות צ'קים — כך שבעתיד נוכל להוסיף Resend / WhatsApp / SMS
 * בלי לשנות את שלד הבדיקה היומית.
 */
export type CheckAlertChannel = "staff_alert" | "email" | "whatsapp" | "sms";

export type CheckAlertPayload = {
  kind: CheckNotificationKind;
  checkId: string;
  title: string;
  body: string;
  /** המשתמשים שיקבלו את ההתראה (אם רלוונטי לאפיק) */
  recipientUserIds: string[];
  /** טלפון/אימייל ליעדים חיצוניים — לא חובה כרגע */
  phone?: string | null;
  email?: string | null;
};

export type CheckNotifier = {
  channel: CheckAlertChannel;
  /** האם הספק זמין / מוגדר (env vars, וכו') */
  isReady(): boolean;
  /** שולח התראה. מחזיר true בהצלחה. אסור לזרוק חריגה. */
  send(payload: CheckAlertPayload): Promise<boolean>;
};
