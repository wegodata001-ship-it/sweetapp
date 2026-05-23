import type { UserRole } from "@prisma/client";
import { matchRule, PAGE_ACCESS_RULES, type PagePermission } from "@/lib/auth/permissions";

/** נתיבים שלא דורשים בדיקת הרשאת מסך (אחרי התחברות) */
const AUTH_SHELL_PREFIXES = ["/login", "/change-password", "/unauthorized"];

function isEmployeeDailyOrders(pathname: string): boolean {
  return (
    pathname === "/admin/daily-orders" ||
    pathname.startsWith("/admin/daily-orders/") ||
    pathname === "/admin/future-orders" ||
    pathname.startsWith("/admin/future-orders/")
  );
}

export function canAccessMyTasksArea(role: UserRole, permSet: Set<string>): boolean {
  return (
    role === "SUPER_ADMIN" ||
    role === "ADMIN" ||
    role === "EMPLOYEE" ||
    permSet.has("employee_clock") ||
    permSet.has("tasks")
  );
}

/**
 * האם למשתמש מותר לגשת לנתיב (תואם לוגיקת middleware).
 */
export function canAccessPath(
  pathname: string,
  role: UserRole,
  permissions: string[],
): boolean {
  if (AUTH_SHELL_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return true;
  }

  if (role === "SUPER_ADMIN") return true;

  const permSet = new Set(permissions);

  if (pathname === "/employee" || pathname.startsWith("/employee/profile")) {
    return true;
  }

  if (
    pathname === "/employee/tasks" ||
    pathname.startsWith("/employee/tasks/") ||
    pathname === "/employee/work-status" ||
    pathname.startsWith("/employee/work-status/") ||
    pathname === "/employee/attendance" ||
    pathname.startsWith("/employee/attendance/") ||
    pathname === "/ops/attendance" ||
    pathname.startsWith("/ops/attendance/")
  ) {
    return canAccessMyTasksArea(role, permSet);
  }

  if (
    pathname === "/employee/hours" ||
    pathname.startsWith("/employee/hours/") ||
    pathname === "/employee/clock" ||
    pathname.startsWith("/employee/clock/")
  ) {
    return role === "EMPLOYEE" || permSet.has("employee_clock");
  }

  if (pathname === "/admin/wedding-orders" || pathname.startsWith("/admin/wedding-orders/")) {
    return role === "ADMIN";
  }

  if (isEmployeeDailyOrders(pathname)) {
    return true;
  }

  if (role === "EMPLOYEE" && pathname.startsWith("/manager")) {
    return false;
  }

  if (
    pathname.startsWith("/finance/register") &&
    !permSet.has("financial_registration") &&
    permSet.has("ledger")
  ) {
    return true;
  }

  const pageRule = matchRule(pathname, PAGE_ACCESS_RULES);

  if (pageRule === null) {
    if (role === "EMPLOYEE" && pathname.startsWith("/admin")) {
      return false;
    }
    return true;
  }

  if (pageRule === "SUPER_ADMIN_ONLY") return false;
  if (pageRule === "ADMIN_ONLY") return role === "ADMIN";

  return permSet.has(pageRule);
}

export function unauthorizedRedirectPath(role: UserRole): string {
  return role === "EMPLOYEE" ? "/employee" : "/";
}

export function requiredPermissionForPath(pathname: string): PagePermission | null {
  return matchRule(pathname, PAGE_ACCESS_RULES);
}
