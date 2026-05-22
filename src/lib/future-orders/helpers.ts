/** קטגוריית מודול */
export const ORDER_CATEGORY_DAILY = "DAILY_ORDER";
export const ORDER_CATEGORY_WEDDING = "WEDDING_ORDER";

export const ORDER_CATEGORIES = [ORDER_CATEGORY_DAILY, ORDER_CATEGORY_WEDDING] as const;
export type OrderCategory = (typeof ORDER_CATEGORIES)[number];

/** סוג פנימי — נשמר ב־eventType */
export const ORDER_KIND_PRIVATE = "PRIVATE";
export const ORDER_KIND_WEDDING = "WEDDING";

export const ORDER_KINDS = [ORDER_KIND_PRIVATE, ORDER_KIND_WEDDING] as const;
export type OrderKind = (typeof ORDER_KINDS)[number];

/** תאימות לאחור */
export const LEGACY_WEDDING_EVENT_TYPES = ["חתונה", "בר מצווה", "בת מצווה"] as const;

export const FUTURE_ORDER_STATUSES = [
  "PENDING",
  "IN_PREPARATION",
  "READY",
  "COMPLETED",
  "CANCELLED",
] as const;

export type FutureOrderStatus = (typeof FUTURE_ORDER_STATUSES)[number];

export type OrdersModule = "daily" | "wedding";

export function statusI18nKey(status: FutureOrderStatus, module: OrdersModule): string {
  const base = module === "daily" ? "admin.dailyOrders" : "admin.weddingOrders";
  const map: Record<FutureOrderStatus, string> = {
    PENDING: `${base}.statusNew`,
    IN_PREPARATION: `${base}.statusPreparing`,
    READY: `${base}.statusReady`,
    COMPLETED: `${base}.statusDelivered`,
    CANCELLED: `${base}.statusCancelled`,
  };
  return map[status];
}

export const STATUS_BADGE_CLASS: Record<FutureOrderStatus, string> = {
  PENDING: "border-amber-300/80 bg-amber-50 text-amber-900",
  IN_PREPARATION: "border-sky-300/80 bg-sky-50 text-sky-900",
  READY: "border-emerald-400/80 bg-emerald-50 text-emerald-900",
  COMPLETED: "border-slate-300/80 bg-slate-100 text-slate-700",
  CANCELLED: "border-rose-300/80 bg-rose-50 text-rose-900",
};

export const WEDDING_GRADIENT = { from: "#c9a227", to: "#7c3aed" };
export const DAILY_GRADIENT = { from: "#bfdbfe", to: "#c7d2fe" };

/** תצוגת סטטוס דוח חתונות — כולל «מאוחר» מחושב לפי תאריך */
export function isWeddingOrderOverdue(row: { eventDate: string; status: string }): boolean {
  if (row.status === "COMPLETED" || row.status === "CANCELLED") return false;
  const d = row.eventDate.slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  return d < today;
}

export const WEDDING_STATUS_BADGE_CLASS: Record<string, string> = {
  IN_PREPARATION: "border-amber-400/90 bg-amber-50 text-amber-950 shadow-sm shadow-amber-100/50",
  READY: "border-emerald-400/90 bg-emerald-50 text-emerald-950 shadow-sm shadow-emerald-100/50",
  COMPLETED: "border-sky-400/90 bg-sky-50 text-sky-950 shadow-sm shadow-sky-100/50",
  OVERDUE: "border-rose-500/90 bg-rose-50 text-rose-950 shadow-sm shadow-rose-100/50",
  PENDING: "border-amber-300/80 bg-amber-50/90 text-amber-900",
  CANCELLED: "border-slate-300/80 bg-slate-100 text-slate-600",
};

export function weddingStatusI18nKey(status: string, overdue: boolean): string {
  if (overdue) return "admin.weddingOrders.statusOverdue";
  const map: Record<string, string> = {
    PENDING: "admin.weddingOrders.statusPreparing",
    IN_PREPARATION: "admin.weddingOrders.statusPreparing",
    READY: "admin.weddingOrders.statusReady",
    COMPLETED: "admin.weddingOrders.statusDelivered",
    CANCELLED: "admin.weddingOrders.statusCancelled",
  };
  return map[status] ?? "admin.weddingOrders.statusPreparing";
}

export function computeRemainingAmount(totalAmount: number, depositAmount: number): number {
  const t = Math.max(0, Number(totalAmount) || 0);
  const d = Math.max(0, Number(depositAmount) || 0);
  return Math.max(0, t - d);
}

export function isValidStatus(s: string): s is FutureOrderStatus {
  return (FUTURE_ORDER_STATUSES as readonly string[]).includes(s);
}

export function isValidOrderCategory(s: string): s is OrderCategory {
  return s === ORDER_CATEGORY_DAILY || s === ORDER_CATEGORY_WEDDING;
}

export function isWeddingKind(eventType: string): boolean {
  const e = eventType.trim();
  if (e === ORDER_KIND_WEDDING) return true;
  return (LEGACY_WEDDING_EVENT_TYPES as readonly string[]).includes(e);
}

export function categoryFromLegacy(eventType: string): OrderCategory {
  return isWeddingKind(eventType) ? ORDER_CATEGORY_WEDDING : ORDER_CATEGORY_DAILY;
}

export function resolveOrderCategory(row: {
  orderCategory?: string | null;
  eventType: string;
}): OrderCategory {
  if (row.orderCategory === ORDER_CATEGORY_DAILY || row.orderCategory === ORDER_CATEGORY_WEDDING) {
    return row.orderCategory;
  }
  return categoryFromLegacy(row.eventType);
}

export function eventTypeForCategory(category: OrderCategory): string {
  return category === ORDER_CATEGORY_WEDDING ? ORDER_KIND_WEDDING : ORDER_KIND_PRIVATE;
}

export function isValidEventType(s: string): boolean {
  const e = s.trim();
  return (
    e === ORDER_KIND_PRIVATE ||
    e === ORDER_KIND_WEDDING ||
    isWeddingKind(e) ||
    isValidOrderCategory(e)
  );
}

export function moduleToCategory(module: OrdersModule): OrderCategory {
  return module === "wedding" ? ORDER_CATEGORY_WEDDING : ORDER_CATEGORY_DAILY;
}

const WEDDING_EVENT_TYPES = [ORDER_KIND_WEDDING, ...LEGACY_WEDDING_EVENT_TYPES] as const;

/** תנאי Prisma לסינון קטגוריה (+ eventType לרשומות לפני backfill) */
export function prismaCategoryFilter(category: OrderCategory) {
  if (category === ORDER_CATEGORY_WEDDING) {
    return {
      OR: [
        { orderCategory: ORDER_CATEGORY_WEDDING },
        { eventType: { in: [...WEDDING_EVENT_TYPES] } },
      ],
    };
  }
  return {
    AND: [
      { NOT: { orderCategory: ORDER_CATEGORY_WEDDING } },
      { eventType: { notIn: [...WEDDING_EVENT_TYPES] } },
    ],
  };
}

let orderCategoriesBackfilled = false;

/** מעדכן רשומות ישנות פעם אחת לתהליך (לא בכל GET) */
export async function backfillOrderCategoriesOnce(
  prisma: import("@prisma/client").PrismaClient,
): Promise<void> {
  if (orderCategoriesBackfilled) return;
  await prisma.futureOrder.updateMany({
    where: { eventType: { in: [...WEDDING_EVENT_TYPES] } },
    data: { orderCategory: ORDER_CATEGORY_WEDDING },
  });
  orderCategoriesBackfilled = true;
}
