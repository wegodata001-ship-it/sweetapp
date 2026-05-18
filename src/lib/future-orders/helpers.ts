export const FUTURE_ORDER_EVENT_TYPES = [
  "חתונה",
  "בר מצווה",
  "בת מצווה",
  "יום הולדת",
  "עסקי",
  "אחר",
] as const;

export type FutureOrderEventType = (typeof FUTURE_ORDER_EVENT_TYPES)[number];

export const FUTURE_ORDER_STATUSES = [
  "PENDING",
  "IN_PREPARATION",
  "READY",
  "COMPLETED",
  "CANCELLED",
] as const;

export type FutureOrderStatus = (typeof FUTURE_ORDER_STATUSES)[number];

export const STATUS_LABELS_HE: Record<FutureOrderStatus, string> = {
  PENDING: "הזמנה פתוחה",
  IN_PREPARATION: "בהכנה",
  READY: "מוכנה",
  COMPLETED: "הסתיימה",
  CANCELLED: "בוטלה",
};

/** צבעי badge לפי סטטוס */
export const STATUS_BADGE_CLASS: Record<FutureOrderStatus, string> = {
  PENDING: "border-amber-300 bg-amber-50 text-amber-900",
  IN_PREPARATION: "border-sky-300 bg-sky-50 text-sky-900",
  READY: "border-emerald-400 bg-emerald-50 text-emerald-900",
  COMPLETED: "border-slate-300 bg-slate-100 text-slate-700",
  CANCELLED: "border-rose-300 bg-rose-50 text-rose-900",
};

export function computeRemainingAmount(totalAmount: number, depositAmount: number): number {
  const t = Math.max(0, Number(totalAmount) || 0);
  const d = Math.max(0, Number(depositAmount) || 0);
  return Math.max(0, t - d);
}

export function isValidStatus(s: string): s is FutureOrderStatus {
  return (FUTURE_ORDER_STATUSES as readonly string[]).includes(s);
}

export function isValidEventType(s: string): s is FutureOrderEventType {
  return (FUTURE_ORDER_EVENT_TYPES as readonly string[]).includes(s);
}
