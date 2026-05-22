import type { TranslateFn } from "./translator";

/** Maps a stored status code to a translated label, with safe fallback. */
function pick(t: TranslateFn, key: string, fallback: string): string {
  const v = t(key);
  return v === key ? fallback : v;
}

export function translateTaskStatus(t: TranslateFn, status: string): string {
  return pick(t, `statuses.task.${status}`, status);
}

export function translateEmployeeTaskGroupStatus(t: TranslateFn, status: string): string {
  return pick(t, `statuses.employeeTaskGroup.${status}`, status);
}

export function translatePaymentStatus(t: TranslateFn, status: string): string {
  return pick(t, `statuses.payment.${status}`, status);
}

export function translateFutureOrderStatus(t: TranslateFn, status: string): string {
  const fo = t(`statuses.futureOrder.${status}`);
  if (fo !== `statuses.futureOrder.${status}`) return fo;
  return pick(t, `statuses.generic.${status}`, status);
}

export function translateCheckStatus(t: TranslateFn, status: string): string {
  return pick(t, `statuses.check.${status}`, status);
}

/** Translate the rich display status (UPCOMING/DUE_TODAY/LATE/...). */
export function translateCheckDisplayStatus(t: TranslateFn, status: string): string {
  return pick(t, `statuses.checkDisplay.${status}`, status);
}

export function translateDepositStatus(t: TranslateFn, status: string): string {
  return pick(t, `statuses.deposit.${status}`, status);
}

export function translateShiftStatus(t: TranslateFn, status: string): string {
  return pick(t, `statuses.shift.${status}`, status);
}

/** Document categories stored in Hebrew ("הכנסה"/"הוצאה") and other code-like values */
export function translateDocCategory(t: TranslateFn, value: string): string {
  if (value === "הכנסה" || value === "INCOME") return t("docType.INCOME");
  if (value === "הוצאה" || value === "EXPENSE") return t("docType.EXPENSE");
  return pick(t, `docType.${value}`, value);
}

/** Translate a permission key */
export function translatePermission(t: TranslateFn, key: string): string {
  return pick(t, `permissions.labels.${key}`, key);
}

/** Translate task priority */
export function translatePriority(t: TranslateFn, value: string): string {
  return pick(t, `admin.tasks.priority.${value}`, value);
}

/** Translate payment method */
export function translatePaymentMethod(t: TranslateFn, value: string): string {
  return pick(t, `register.fields.paymentMethods.${value}`, value);
}

/** Map Hebrew event-type DB enum values to a stable identifier */
const FUTURE_ORDER_EVENT_TYPE_ID: Record<string, string> = {
  "חתונה": "wedding",
  "בר מצווה": "barMitzvah",
  "בת מצווה": "batMitzvah",
  "יום הולדת": "birthday",
  "עסקי": "business",
  "אחר": "other",
};

/** Translate a future-order event type stored in the database */
export function translateFutureOrderEventType(t: TranslateFn, value: string): string {
  if (value === "PRIVATE") return pick(t, "admin.futureOrders.kindPrivate", value);
  if (value === "WEDDING") return pick(t, "admin.futureOrders.kindWedding", value);
  const id = FUTURE_ORDER_EVENT_TYPE_ID[value];
  if (id) return pick(t, `admin.futureOrders.eventTypes.${id}`, value);
  return value;
}

/** Map Hebrew inventory category DB enum values to a stable identifier */
const INVENTORY_CATEGORY_ID: Record<string, string> = {
  "חומרי גלם": "rawMaterials",
  "אריזות": "packaging",
  "קירור": "refrigeration",
  "מדבקות": "labels",
  "כללי": "general",
  "מיקום": "location",
};

/** Translate an inventory category stored in the database (Hebrew enum) */
export function translateInventoryCategory(t: TranslateFn, value: string): string {
  const id = INVENTORY_CATEGORY_ID[value];
  if (id) return pick(t, `ops.inventory.categories.${id}`, value);
  return value;
}
