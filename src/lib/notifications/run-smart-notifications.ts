import { checkLateEmployees } from "@/lib/notifications/checkLateEmployees";
import { checkOverdueTasks } from "@/lib/notifications/checkOverdueTasks";
import { checkPendingChecks } from "@/lib/notifications/checkPendingChecks";
import { checkFutureOrders } from "@/lib/notifications/checkFutureOrders";

export type SmartNotificationsRunResult = {
  lateEmployees: { admin: number; employee: number };
  overdueTasks: number;
  pendingChecks: number;
  futureOrders: number;
};

/** הרצת כל בודקי ההתראות האוטומטיים */
export async function runSmartNotifications(): Promise<SmartNotificationsRunResult> {
  const [lateEmployees, overdueTasks, pendingChecks, futureOrders] = await Promise.all([
    checkLateEmployees(),
    checkOverdueTasks(),
    checkPendingChecks(),
    checkFutureOrders(),
  ]);
  return { lateEmployees, overdueTasks, pendingChecks, futureOrders };
}
