/**
 * סטטוסי צ'ק (CheckPayment.status)
 *  PENDING — מחכה לפירעון
 *  DEPOSITED — הופקד בבנק (טרם נפרע)
 *  CLEARED — נפרע בהצלחה
 *  BOUNCED — חזר (סיבה ב־bounceReason)
 *  EXPIRED — עבר תאריך — מחושב לפי dueDate ולא נשמר בהכרח
 *  CANCELLED — בוטל ידנית
 */
export const CHECK_STATUSES = [
  "PENDING",
  "DEPOSITED",
  "CLEARED",
  "BOUNCED",
  "EXPIRED",
  "CANCELLED",
] as const;

export type CheckStatus = (typeof CHECK_STATUSES)[number];

export const CHECK_STATUS_LABELS: Record<CheckStatus, string> = {
  PENDING: "ממתין",
  DEPOSITED: "הופקד",
  CLEARED: "נפרע",
  BOUNCED: "חזר",
  EXPIRED: "עבר תאריך",
  CANCELLED: "בוטל",
};

/** סטטוסים שעדיין "פתוחים" — מופיעים כצ'קים חיים בלוח */
export const OPEN_CHECK_STATUSES: ReadonlyArray<CheckStatus> = [
  "PENDING",
  "DEPOSITED",
];

/** סטטוסים שניתנים לפעולה (סימון כהופקד/נפרע/חזר) */
export function canDeposit(status: CheckStatus): boolean {
  return status === "PENDING";
}
export function canClear(status: CheckStatus): boolean {
  return status === "PENDING" || status === "DEPOSITED";
}
export function canBounce(status: CheckStatus): boolean {
  return status === "PENDING" || status === "DEPOSITED";
}
export function canCancel(status: CheckStatus): boolean {
  return status === "PENDING" || status === "DEPOSITED";
}

/** רמת אזהרה / צבע — לתצוגה לפי תאריך פירעון וסטטוס */
export type CheckTier = "neutral" | "green" | "yellow" | "orange" | "red";

export const CHECK_NOTIFICATION_KINDS = [
  "due_in_7",
  "due_in_3",
  "due_today",
  "overdue",
  "bounced",
  "deposited",
] as const;
export type CheckNotificationKind = (typeof CHECK_NOTIFICATION_KINDS)[number];
