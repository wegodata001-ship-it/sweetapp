/**
 * קטגוריות התראות מערכת.
 *
 * ה־NotificationType מתאר את האירוע הפנימי; הקטגוריה היא היחידה שנמען חיצוני בוחר
 * לקבל. לכן היא רחבה יותר: היא מכסה גם התראות שאינן שורת Notification בכלל
 * (דוח יומי, כשל cron, כשל גיבוי, שגיאת שרת) — כדי שכל התראה חשובה במערכת
 * תוכל לזרום לאותה רשימת נמענים.
 */

export const SYSTEM_ALERT_CATEGORIES = [
  "inventoryCountCompleted",
  "inventoryDailyReport",
  "inventoryLow",
  "inventoryAnomaly",
  "taskNew",
  "taskLate",
  "attendanceLate",
  "attendanceMissing",
  "checks",
  "orders",
  "cashflow",
  "businessUpdate",
  "systemCritical",
  "cronFailure",
  "backupFailure",
  "emailFailure",
  "pdfFailure",
  "serverError",
  "integrationFailure",
] as const;

export type SystemAlertCategory = (typeof SYSTEM_ALERT_CATEGORIES)[number];

const CATEGORY_SET = new Set<string>(SYSTEM_ALERT_CATEGORIES);

export function isSystemAlertCategory(value: unknown): value is SystemAlertCategory {
  return typeof value === "string" && CATEGORY_SET.has(value);
}

/** שומר רק קטגוריות מוכרות ומסיר כפילויות — הגנה על קלט מה־API */
export function sanitizeCategories(input: unknown): SystemAlertCategory[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<SystemAlertCategory>();
  for (const raw of input) {
    if (isSystemAlertCategory(raw)) seen.add(raw);
  }
  return SYSTEM_ALERT_CATEGORIES.filter((c) => seen.has(c));
}

/**
 * NotificationType -> קטגוריה. כל ערך ב־enum ממופה, כך שהוספת סוג התראה חדש
 * תיפול לקטגוריה מפורשת ולא תישלח בשקט לכולם.
 */
const TYPE_TO_CATEGORY: Record<string, SystemAlertCategory> = {
  TASK_ASSIGNED: "taskNew",
  TASK_STARTED: "taskNew",
  TASK_COMPLETED: "taskNew",
  TASK_GROUP_COMPLETED: "taskNew",
  TASK_LATE: "taskLate",
  TASK_OVERDUE: "taskLate",
  CLOCK_IN_LATE: "attendanceLate",
  SHIFT_LATE: "attendanceLate",
  OVERTIME: "attendanceLate",
  CLOCK_OUT: "attendanceMissing",
  MISSED_CLOCK_IN: "attendanceMissing",
  MISSED_CLOCK_OUT: "attendanceMissing",
  CHECK_DUE: "checks",
  CHECK_DEPOSIT: "checks",
  CHECK_DEPOSITED: "checks",
  CHECK_BOUNCED: "checks",
  INVENTORY_LOW: "inventoryLow",
  INVENTORY_COUNT_INCOMPLETE: "inventoryAnomaly",
  NEW_ORDER: "orders",
  ORDER_DELAYED: "orders",
  FUTURE_ORDER: "orders",
  CASHFLOW_SHORTAGE: "cashflow",
  NEW_UPDATE: "businessUpdate",
  PERSONAL_NOTE: "businessUpdate",
  SYSTEM_ALERT: "systemCritical",
};

export function categoryForNotificationType(type: string): SystemAlertCategory {
  return TYPE_TO_CATEGORY[type] ?? "systemCritical";
}

/**
 * התראות אישיות שאין טעם להעביר לנמען חיצוני — הערה אישית לעובד היא לא
 * התראה עסקית. נשמר כרשימה מפורשת כדי שההחלטה תהיה גלויה.
 */
const PRIVATE_TYPES = new Set<string>(["PERSONAL_NOTE"]);

export function isForwardableNotificationType(type: string): boolean {
  return !PRIVATE_TYPES.has(type);
}

/** האם נמען מסוים אמור לקבל קטגוריה זו */
export function recipientWantsCategory(
  recipient: { isActive: boolean; allCategories: boolean; categories: string[] },
  category: SystemAlertCategory,
): boolean {
  if (!recipient.isActive) return false;
  if (recipient.allCategories) return true;
  return recipient.categories.includes(category);
}
