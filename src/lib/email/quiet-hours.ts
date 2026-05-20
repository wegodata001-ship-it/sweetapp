/** שעות שקט — 23:00–07:00 שעון ישראל (ברירת מחדל) */

export function israelHourMinute(now = new Date()): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jerusalem",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return { hour, minute };
}

/** בין 23:00 ל-07:00 */
export function isQuietHours(now = new Date()): boolean {
  const { hour, minute } = israelHourMinute(now);
  const mins = hour * 60 + minute;
  const start = 23 * 60;
  const end = 7 * 60;
  return mins >= start || mins < end;
}
