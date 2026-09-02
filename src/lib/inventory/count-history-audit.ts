/**
 * עזרי Audit להיסטוריית ספירות — READ-ONLY, ללא שינוי לוגיקת שמירה.
 */
import { israelCalendarDateString } from "@/lib/staff/work-date";
import { ISRAEL_TIMEZONE } from "@/lib/inventory/weekday-minimum";

export { ISRAEL_TIMEZONE };

/** YYYY-MM-DD ב־Asia/Jerusalem */
export function israelYmd(d = new Date()): string {
  return israelCalendarDateString(d);
}

export function addCalendarDaysYmd(ymd: string, deltaDays: number): string {
  const [y, m, d] = ymd.split("-").map((x) => parseInt(x, 10));
  const utc = new Date(Date.UTC(y, m - 1, d + deltaDays));
  return utc.toISOString().slice(0, 10);
}

/** תחילת יום לוח שנה בישראל כ־UTC Date */
export function israelDayStartUtc(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map((x) => parseInt(x, 10));
  if (!y || !m || !d) return new Date(NaN);
  // חיפוש השעה הראשונה שבה התאריך בירושלים הוא ymd
  for (let hour = -3; hour <= 28; hour++) {
    const candidate = new Date(Date.UTC(y, m - 1, d, hour, 0, 0, 0));
    if (israelCalendarDateString(candidate) === ymd) {
      // נסיגה למילישניה הראשונה של אותו יום
      let t = candidate.getTime();
      while (israelCalendarDateString(new Date(t - 1)) === ymd) {
        t -= 1;
      }
      return new Date(t);
    }
  }
  return new Date(Date.UTC(y, m - 1, d, 21, 0, 0, 0)); // fallback ≈ חצות IDT
}

export function israelDayEndUtc(ymd: string): Date {
  const next = addCalendarDaysYmd(ymd, 1);
  return new Date(israelDayStartUtc(next).getTime() - 1);
}

export function israelCreatedAtRange(dateFrom: string, dateTo: string): {
  gte: Date;
  lte: Date;
} {
  return {
    gte: israelDayStartUtc(dateFrom),
    lte: israelDayEndUtc(dateTo),
  };
}

export type QuickRangeKey =
  | "today"
  | "yesterday"
  | "7d"
  | "30d"
  | "month"
  | "custom";

export function resolveQuickRange(
  key: QuickRangeKey,
  customFrom?: string | null,
  customTo?: string | null,
): { dateFrom: string; dateTo: string } {
  const today = israelYmd();
  switch (key) {
    case "today":
      return { dateFrom: today, dateTo: today };
    case "yesterday": {
      const y = addCalendarDaysYmd(today, -1);
      return { dateFrom: y, dateTo: y };
    }
    case "7d":
      return { dateFrom: addCalendarDaysYmd(today, -6), dateTo: today };
    case "30d":
      return { dateFrom: addCalendarDaysYmd(today, -29), dateTo: today };
    case "month": {
      const [y, m] = today.split("-");
      return { dateFrom: `${y}-${m}-01`, dateTo: today };
    }
    case "custom":
    default:
      return {
        dateFrom: (customFrom?.trim() || addCalendarDaysYmd(today, -6)),
        dateTo: (customTo?.trim() || today),
      };
  }
}

export function formatIsraelDateTime(iso: string | Date): {
  date: string;
  time: string;
} {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const date = new Intl.DateTimeFormat("en-GB", {
    timeZone: ISRAEL_TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: ISRAEL_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
  return { date, time };
}

export function isPositiveToZero(previous: number, current: number): boolean {
  return previous > 0 && current === 0;
}

/** ירידה מעל 50% מכמות קודמת חיובית */
export function isSignificantDrop(previous: number, current: number): boolean {
  return previous > 0 && current < previous * 0.5;
}

export function changeFlags(previous: number, current: number): {
  positiveToZero: boolean;
  significantDrop: boolean;
  direction: "up" | "down" | "flat";
} {
  const diff = current - previous;
  return {
    positiveToZero: isPositiveToZero(previous, current),
    significantDrop: isSignificantDrop(previous, current),
    direction: diff > 0 ? "up" : diff < 0 ? "down" : "flat",
  };
}
