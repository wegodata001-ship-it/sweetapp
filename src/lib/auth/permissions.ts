/** מפתחות הרשאה — תואמים UserPermission.permission */
export const PERMISSION_KEYS = [
  "financial_registration",
  "ledger",
  "cash_flow",
  "inventory",
  "tasks",
  "employee_clock",
  "reports",
  "settings",
  "admin",
  "wedding_orders",
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];

/** קבוצות להצגה ב-modal הרשאות */
export const PERMISSION_GROUPS: { groupKey: string; keys: PermissionKey[] }[] = [
  {
    groupKey: "permissions.groups.finance",
    keys: ["financial_registration", "ledger", "cash_flow"],
  },
  {
    groupKey: "permissions.groups.ops",
    keys: ["inventory", "tasks", "employee_clock"],
  },
  {
    groupKey: "permissions.groups.other",
    keys: ["reports", "settings", "admin", "wedding_orders"],
  },
];

export const PERMISSION_LABELS: Record<PermissionKey, string> = {
  financial_registration: "רישום כספי",
  ledger: "כרטסות",
  cash_flow: "תזרים מזומנים",
  inventory: "מלאי וספירה",
  tasks: "משימות וטפסים",
  employee_clock: "פורטל עובד",
  reports: "דוחות",
  settings: "הגדרות",
  admin: "ניהול משתמשים (ADMIN)",
  wedding_orders: "הזמנות חתונות / אירועים",
};

/** דפים — לפי התאמה ארוכה ביותר */
export type PagePermission = PermissionKey | "SUPER_ADMIN_ONLY" | "ADMIN_ONLY";

export const PAGE_ACCESS_RULES: { prefix: string; permission: PagePermission }[] = [
  { prefix: "/admin/users", permission: "SUPER_ADMIN_ONLY" },
  { prefix: "/finance/suppliers-prices", permission: "financial_registration" },
  { prefix: "/finance/register", permission: "financial_registration" },
  { prefix: "/finance/archive", permission: "financial_registration" },
  { prefix: "/finance/income", permission: "financial_registration" },
  { prefix: "/finance/expenses", permission: "financial_registration" },
  { prefix: "/finance/ledgers", permission: "ledger" },
  { prefix: "/finance/cashflow", permission: "cash_flow" },
  { prefix: "/finance", permission: "financial_registration" },
  { prefix: "/admin/work-status", permission: "tasks" },
  { prefix: "/admin/wedding-orders", permission: "wedding_orders" },
  { prefix: "/admin/daily-orders", permission: "employee_clock" },
  { prefix: "/admin/future-orders", permission: "employee_clock" },
  { prefix: "/admin/staff", permission: "tasks" },
  { prefix: "/admin/email-logs", permission: "tasks" },
  { prefix: "/admin/debug", permission: "tasks" },
  { prefix: "/api/admin/email-logs", permission: "tasks" },
  { prefix: "/admin/tasks", permission: "tasks" },
  { prefix: "/api/admin/debug", permission: "tasks" },
  { prefix: "/admin/forms", permission: "tasks" },
  { prefix: "/ops/inventory", permission: "inventory" },
  { prefix: "/ops/recipes", permission: "tasks" },
  { prefix: "/ops/kanban", permission: "tasks" },
  { prefix: "/ops", permission: "tasks" },
  { prefix: "/worker", permission: "employee_clock" },
];

/** API — נתיב לפי קידומת */
export const API_ACCESS_RULES: { prefix: string; permission: PermissionKey | "SUPER_ADMIN_ONLY" }[] = [
  { prefix: "/api/admin/users", permission: "SUPER_ADMIN_ONLY" },
  { prefix: "/api/procurement", permission: "financial_registration" },
  { prefix: "/api/documents", permission: "financial_registration" },
  { prefix: "/api/payments", permission: "financial_registration" },
  { prefix: "/api/pdfs", permission: "financial_registration" },
  { prefix: "/api/product-history", permission: "financial_registration" },
  { prefix: "/api/finance/stats", permission: "financial_registration" },
  { prefix: "/api/finance/product-picker", permission: "financial_registration" },
  { prefix: "/api/customers/", permission: "ledger" },
  { prefix: "/api/suppliers/", permission: "ledger" },
  { prefix: "/api/employees/", permission: "ledger" },
  { prefix: "/api/customers", permission: "financial_registration" },
  { prefix: "/api/cashflow/opening", permission: "cash_flow" },
  { prefix: "/api/cashflow", permission: "cash_flow" },
  { prefix: "/api/ledger", permission: "ledger" },
  { prefix: "/api/suppliers", permission: "ledger" },
  { prefix: "/api/employees", permission: "ledger" },
  { prefix: "/api/inventory", permission: "inventory" },
  { prefix: "/api/recipes", permission: "tasks" },
  { prefix: "/api/work-status", permission: "tasks" },
  { prefix: "/api/admin/work-library", permission: "tasks" },
  { prefix: "/api/admin/work-templates", permission: "tasks" },
  { prefix: "/api/admin/work-assign", permission: "tasks" },
  { prefix: "/api/admin/work-tasks", permission: "tasks" },
  { prefix: "/api/workflows", permission: "tasks" },
  { prefix: "/api/future-orders", permission: "employee_clock" },
  { prefix: "/api/form-fields", permission: "tasks" },
  { prefix: "/api/staff/attendance/", permission: "tasks" },
  { prefix: "/api/staff/attendance", permission: "tasks" },
  { prefix: "/api/staff/shifts/", permission: "tasks" },
  { prefix: "/api/staff/shifts", permission: "tasks" },
  { prefix: "/api/staff/dashboard", permission: "tasks" },
];

export function matchRule(pathname: string, rules: typeof PAGE_ACCESS_RULES): PagePermission | null {
  const sorted = [...rules].sort((a, b) => b.prefix.length - a.prefix.length);
  for (const r of sorted) {
    if (pathname === r.prefix || pathname.startsWith(`${r.prefix}/`)) {
      return r.permission;
    }
  }
  return null;
}

export function hasPermissionSet(have: Set<string>, need: PermissionKey): boolean {
  return have.has(need);
}
