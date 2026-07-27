/**
 * טווחי זמן לסיכומי ספירות — היום / השבוע / החודש / טווח מותאם אישית.
 * מודול טהור (ללא prisma) כדי שגם ה־API וגם הבדיקות ישתמשו באותה הגדרה.
 */

import { localDay } from "./daily-count-report";

export const SUMMARY_PRESETS = ["today", "week", "month", "custom"] as const;
export type SummaryPreset = (typeof SUMMARY_PRESETS)[number];

/** תקרת טווח — מגן על זמן התגובה ועל צריכת הזיכרון בייצוא */
export const MAX_SUMMARY_RANGE_DAYS = 366;

export type ResolvedSummaryRange = {
  preset: SummaryPreset;
  from: string;
  to: string;
  /** true כשהטווח נחתך בגלל MAX_SUMMARY_RANGE_DAYS */
  clamped: boolean;
};

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function isSummaryPreset(value: unknown): value is SummaryPreset {
  return typeof value === "string" && (SUMMARY_PRESETS as readonly string[]).includes(value);
}

/** בדיקה שהמחרוזת היא תאריך לוח אמיתי ולא רק בפורמט הנכון (2026-02-31 נפסל) */
export function isValidDayString(value: unknown): value is string {
  if (typeof value !== "string" || !DAY_RE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

function shiftDay(day: string, deltaDays: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return localDay(new Date(y, m - 1, d + deltaDays));
}

/** מספר הימים בטווח כולל שני הקצוות */
export function daysInRange(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  const diff = Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd);
  return Math.floor(diff / MS_PER_DAY) + 1;
}

/**
 * הפיכת בחירת המשתמש לטווח ימים קונקרטי.
 * "השבוע" = השבוע הקלנדרי הנוכחי מיום ראשון, "החודש" = מה־1 בחודש — שניהם עד היום.
 * קלט לא תקין נופל בחזרה ל"היום" במקום לזרוק, כדי שהמסך לעולם לא יישאר ריק.
 */
export function resolveSummaryRange(input: {
  preset?: string | null;
  from?: string | null;
  to?: string | null;
  now?: Date;
}): ResolvedSummaryRange {
  const now = input.now ?? new Date();
  const today = localDay(now);
  const preset: SummaryPreset = isSummaryPreset(input.preset) ? input.preset : "today";

  if (preset === "today") return { preset, from: today, to: today, clamped: false };

  if (preset === "week") {
    // getDay(): 0 = ראשון — תחילת השבוע בישראל
    const from = shiftDay(today, -now.getDay());
    return { preset, from, to: today, clamped: false };
  }

  if (preset === "month") {
    const from = `${today.slice(0, 7)}-01`;
    return { preset, from, to: today, clamped: false };
  }

  const rawFrom = isValidDayString(input.from) ? input.from : today;
  const rawTo = isValidDayString(input.to) ? input.to : today;
  // קצוות הפוכים הם טעות קלט נפוצה — מתקנים במקום להחזיר טווח ריק
  let from = rawFrom <= rawTo ? rawFrom : rawTo;
  const to = rawFrom <= rawTo ? rawTo : rawFrom;

  let clamped = false;
  if (daysInRange(from, to) > MAX_SUMMARY_RANGE_DAYS) {
    from = shiftDay(to, -(MAX_SUMMARY_RANGE_DAYS - 1));
    clamped = true;
  }
  return { preset, from, to, clamped };
}
