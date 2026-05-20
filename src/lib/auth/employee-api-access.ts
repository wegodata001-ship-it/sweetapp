import { UserRole } from "@prisma/client";

/** עובד טהור — ללא הרשאות מנהל */
export function isPureEmployeeRole(role: UserRole): boolean {
  return role === UserRole.EMPLOYEE;
}

/**
 * APIי workflow מותרים לעובד (רק צפייה/הפעלה על ריצות משויכות אליו).
 * יצירת ריצות ותבניות — מנהל בלבד.
 */
export function employeeWorkflowApiAllowed(apiPath: string, method: string): boolean {
  const m = method.toUpperCase();
  if (m === "GET" && apiPath === "/api/workflows/runs") return true;
  if (m === "GET" && /^\/api\/workflows\/runs\/[^/]+$/.test(apiPath)) return true;
  if (m === "POST" && /^\/api\/workflows\/runs\/[^/]+\/items\/[^/]+$/.test(apiPath)) return true;
  if (m === "POST" && /^\/api\/workflows\/runs\/[^/]+$/.test(apiPath)) return true;
  return false;
}
