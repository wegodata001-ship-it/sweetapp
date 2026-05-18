/** זמן התחלת משמרת (ISO) — לטוסט אמצע יום ולחוויית פתיחה */
export const EMPLOYEE_WORK_SESSION_STARTED_AT_KEY = "employee_work_session_started_at";

export function employeeMiddayToastKey(userId: string, calendarYmd: string): string {
  return `employee_midday_toast_${userId}_${calendarYmd}`;
}
