/** ערכים נשמרים ב-metadata.expenseType — רק מסמכי הוצאה */
export const EXPENSE_TYPE_VALUES = [
  "SUPPLIER_PAYMENTS",
  "DAILY_PAYMENTS",
  "WORKER_PAYMENTS",
  "EXTERNAL_PAYMENTS",
  "INVESTMENTS",
] as const;

export type ExpenseType = (typeof EXPENSE_TYPE_VALUES)[number];

export const DEFAULT_EXPENSE_TYPE: ExpenseType = "SUPPLIER_PAYMENTS";

export const EXPENSE_TYPE_I18N: Record<ExpenseType, string> = {
  SUPPLIER_PAYMENTS: "register.expenseTypes.supplierPayments",
  DAILY_PAYMENTS: "register.expenseTypes.dailyPayments",
  WORKER_PAYMENTS: "register.expenseTypes.workerPayments",
  EXTERNAL_PAYMENTS: "register.expenseTypes.externalPayments",
  INVESTMENTS: "register.expenseTypes.investments",
};

export function isExpenseType(v: unknown): v is ExpenseType {
  return typeof v === "string" && (EXPENSE_TYPE_VALUES as readonly string[]).includes(v);
}

export function normalizeExpenseType(v: unknown): ExpenseType {
  return isExpenseType(v) ? v : DEFAULT_EXPENSE_TYPE;
}
