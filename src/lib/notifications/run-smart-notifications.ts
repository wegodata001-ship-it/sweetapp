import { checkLateEmployees } from "@/lib/notifications/checkLateEmployees";
import { checkOverdueTasks } from "@/lib/notifications/checkOverdueTasks";
import { checkPendingChecks } from "@/lib/notifications/checkPendingChecks";
import { checkFutureOrders } from "@/lib/notifications/checkFutureOrders";
import { checkCashflowShortage } from "@/lib/notifications/checkCashflowShortage";
import { retryFailedNotificationEmails } from "@/lib/email/retry-failed-emails";

export type SmartNotificationsRunResult = {
  lateEmployees: { admin: number; employee: number };
  overdueTasks: number;
  pendingChecks: number;
  futureOrders: number;
  cashflowShortages: number;
  emailRetries: number;
};

/** הרצת כל בודקי ההתראות האוטומטיים */
export async function runSmartNotifications(): Promise<SmartNotificationsRunResult> {
  const [lateEmployees, overdueTasks, pendingChecks, futureOrders, cashflowShortages, emailRetries] =
    await Promise.all([
      checkLateEmployees(),
      checkOverdueTasks(),
      checkPendingChecks(),
      checkFutureOrders(),
      checkCashflowShortage(),
      retryFailedNotificationEmails(),
    ]);
  return { lateEmployees, overdueTasks, pendingChecks, futureOrders, cashflowShortages, emailRetries };
}
