import {
  CHECK_STATUSES,
  type CheckStatus,
  type CheckTier,
} from "@/lib/checks/types";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function isCheckStatus(s: string): s is CheckStatus {
  return (CHECK_STATUSES as readonly string[]).includes(s);
}

/** הופך כל ערך לתאריך 00:00 בזמן מקומי (יום) */
export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** מספר ימים עד תאריך הפירעון (חיובי = עוד נשאר; שלילי = איחור) */
export function daysUntilDue(dueDate: Date, now: Date = new Date()): number {
  const a = startOfDay(now).getTime();
  const b = startOfDay(dueDate).getTime();
  return Math.round((b - a) / MS_PER_DAY);
}

/**
 * צבע לצ'ק לפי סטטוס + ימים שנותרו לפירעון:
 *  - CLEARED → ירוק
 *  - BOUNCED → אדום
 *  - CANCELLED → ניטרלי
 *  - EXPIRED / PENDING+overdue / DEPOSITED+overdue → אדום
 *  - ≤2 ימים → כתום
 *  - ≤7 ימים → צהוב
 *  - אחרת → ירוק
 */
export function checkTier(input: {
  status: CheckStatus;
  dueDate: Date;
  now?: Date;
}): CheckTier {
  const { status, dueDate } = input;
  const now = input.now ?? new Date();
  if (status === "CANCELLED") return "neutral";
  if (status === "CLEARED") return "green";
  if (status === "BOUNCED" || status === "EXPIRED") return "red";

  const d = daysUntilDue(dueDate, now);
  if (d < 0) return "red"; // איחור
  if (d <= 2) return "orange";
  if (d <= 7) return "yellow";
  return "green";
}

/**
 * סטטוס "אפקטיבי" לתצוגה: אם המקור PENDING/DEPOSITED ו־dueDate בעבר → EXPIRED.
 * זה לא משנה את הסטטוס במסד — רק תצוגה.
 */
export function effectiveCheckStatus(input: {
  status: CheckStatus;
  dueDate: Date;
  now?: Date;
}): CheckStatus {
  const now = input.now ?? new Date();
  if (input.status === "PENDING" || input.status === "DEPOSITED") {
    if (daysUntilDue(input.dueDate, now) < 0) return "EXPIRED";
  }
  return input.status;
}

/**
 * Rich display status used by the checks UI and dashboard.
 * Derived purely from {status, dueDate, today}.
 *  PENDING + days > 7 → UPCOMING (yellow)
 *  PENDING + 1..7    → DUE_SOON (orange)
 *  PENDING + 0       → DUE_TODAY (blue)
 *  PENDING + < 0     → LATE (dark red)
 *  DEPOSITED + ≥ 0   → DEPOSITED (green)
 *  DEPOSITED + < 0   → LATE
 *  CLEARED           → CLEARED (green)
 *  BOUNCED           → RETURNED (red)
 *  EXPIRED           → LATE
 *  CANCELLED         → CANCELLED (neutral)
 */
export type CheckDisplayStatus =
  | "UPCOMING"
  | "DUE_SOON"
  | "DUE_TODAY"
  | "LATE"
  | "DEPOSITED"
  | "CLEARED"
  | "RETURNED"
  | "CANCELLED";

export function checkDisplayStatus(input: {
  status: CheckStatus;
  dueDate: Date;
  now?: Date;
}): CheckDisplayStatus {
  const now = input.now ?? new Date();
  const d = daysUntilDue(input.dueDate, now);
  switch (input.status) {
    case "CANCELLED":
      return "CANCELLED";
    case "CLEARED":
      return "CLEARED";
    case "BOUNCED":
      return "RETURNED";
    case "EXPIRED":
      return "LATE";
    case "DEPOSITED":
      return d < 0 ? "LATE" : "DEPOSITED";
    case "PENDING":
    default:
      if (d < 0) return "LATE";
      if (d === 0) return "DUE_TODAY";
      if (d <= 7) return "DUE_SOON";
      return "UPCOMING";
  }
}

/** Tier mapping for the rich display status. */
export function displayTier(display: CheckDisplayStatus): CheckTier {
  switch (display) {
    case "CLEARED":
    case "DEPOSITED":
      return "green";
    case "UPCOMING":
      return "yellow";
    case "DUE_SOON":
      return "orange";
    case "DUE_TODAY":
      return "yellow";
    case "LATE":
    case "RETURNED":
      return "red";
    case "CANCELLED":
    default:
      return "neutral";
  }
}
