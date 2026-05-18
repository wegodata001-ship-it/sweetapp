/** תאריך לוח שנה בישראל (YYYY-MM-DD) */
export function israelCalendarDateString(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** אובייקט Date ל־@db.Date (UTC חצות ליום) */
export function parseCalendarDateToDbDate(isoYmd: string): Date {
  const [y, m, d] = isoYmd.split("-").map((x) => parseInt(x, 10));
  if (!y || !m || !d) return new Date(NaN);
  return new Date(Date.UTC(y, m - 1, d));
}

export function hmToMinutes(hm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm.trim());
  if (!m) return null;
  const h = Math.min(23, Math.max(0, parseInt(m[1], 10)));
  const mi = Math.min(59, Math.max(0, parseInt(m[2], 10)));
  return h * 60 + mi;
}

export function minutesSinceMidnightIsrael(clock: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jerusalem",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(clock);
  const h = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
  const min = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10);
  return h * 60 + min;
}
