/**
 * תאריך משימה מהטופס YYYY-MM-DD → Date בחצות לוקאלית (תצוגה / אחסון עקבי).
 */
export function parseTaskDateInput(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map((x) => parseInt(x, 10));
  if (!y || !m || !d) return new Date(NaN);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

/**
 * תאריך משימה + שעת התחלה מתוזמנת → חותמת זמן להשוואת באיחור.
 */
export function scheduledStartDateTime(taskDate: Date, startTime: string): Date {
  const y = taskDate.getFullYear();
  const mo = taskDate.getMonth();
  const d = taskDate.getDate();
  const parts = startTime.trim().split(":").map((x) => parseInt(x, 10));
  const hh = Number.isFinite(parts[0]) ? parts[0] : 0;
  const mm = Number.isFinite(parts[1]) ? parts[1] : 0;
  return new Date(y, mo, d, hh, mm, 0, 0);
}

export function scheduledStartMs(taskDate: Date, startTime: string): number {
  return scheduledStartDateTime(taskDate, startTime).getTime();
}

/** יום לוקאלי מקובץ ISO של שדה תאריך — לעריכה מהירה */
export function formatDateInputLocal(isoOrDate: string | Date): string {
  const dt = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  if (!Number.isFinite(dt.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}
