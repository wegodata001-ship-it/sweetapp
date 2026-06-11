import { checkLateEmployees } from "@/lib/notifications/checkLateEmployees";
import { checkOverdueTasks } from "@/lib/notifications/checkOverdueTasks";
import { checkPendingChecks } from "@/lib/notifications/checkPendingChecks";
import { checkFutureOrders } from "@/lib/notifications/checkFutureOrders";
import { checkCashflowShortage } from "@/lib/notifications/checkCashflowShortage";
import { checkMissedAttendance } from "@/lib/notifications/checkMissedAttendance";
import { checkInventoryLow } from "@/lib/notifications/checkInventoryLow";
import { checkEmployeeOverdueTasks } from "@/lib/notifications/checkEmployeeOverdueTasks";
import { retryFailedNotificationEmails } from "@/lib/email/retry-failed-emails";

export type SmartNotificationsRunResult = {
  lateEmployees: { admin: number; employee: number };
  overdueTasks: number;
  employeeOverdueTasks: number;
  pendingChecks: number;
  futureOrders: number;
  cashflowShortages: number;
  missedAttendance: { missedIn: number; missedOut: number };
  inventoryLow: number;
  emailRetries: number;
};

/** הרצת כל בודקי ההתראות האוטומטיים */
export async function runSmartNotifications(): Promise<SmartNotificationsRunResult> {
  const [
    lateEmployees,
    overdueTasks,
    employeeOverdueTasks,
    pendingChecks,
    futureOrders,
    cashflowShortages,
    missedAttendance,
    inventoryLow,
    emailRetries,
  ] = await Promise.all([
    checkLateEmployees(),
    checkOverdueTasks(),
    checkEmployeeOverdueTasks(),
    checkPendingChecks(),
    checkFutureOrders(),
    checkCashflowShortage(),
    checkMissedAttendance(),
    checkInventoryLow(),
    retryFailedNotificationEmails(),
  ]);
  return {
    lateEmployees,
    overdueTasks,
    employeeOverdueTasks,
    pendingChecks,
    futureOrders,
    cashflowShortages,
    missedAttendance,
    inventoryLow,
    emailRetries,
  };
}
