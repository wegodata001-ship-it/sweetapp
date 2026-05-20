import { checkLateEmployees } from "@/lib/notifications/checkLateEmployees";

/** @deprecated — השתמשו ב־checkLateEmployees; נשמר לתאימות */
export async function ensureMissedClockInAlertsForToday(): Promise<void> {
  await checkLateEmployees();
}
