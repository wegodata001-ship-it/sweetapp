/**
 * מינימום לפי יום בשבוע (Asia/Jerusalem).
 * null = לא הוגדר · 0 = מינימום מפורש של אפס (תקין).
 */

export const ISRAEL_TIMEZONE = "Asia/Jerusalem";

/** Sunday = 0 … Saturday = 6 (Israel business week) */
export const WEEKDAY_MINIMUM_FIELDS = [
  "minimumSun",
  "minimumMon",
  "minimumTue",
  "minimumWed",
  "minimumThu",
  "minimumFri",
  "minimumSat",
] as const;

export type WeekdayMinimumField = (typeof WEEKDAY_MINIMUM_FIELDS)[number];

export type PlacementWeekdayMinimums = {
  minimumQuantity?: number | null;
  minimumSun?: number | null;
  minimumMon?: number | null;
  minimumTue?: number | null;
  minimumWed?: number | null;
  minimumThu?: number | null;
  minimumFri?: number | null;
  minimumSat?: number | null;
};

export type WeekdayMinimumValues = Record<WeekdayMinimumField, number | null>;

const WEEKDAY_LONG_TO_INDEX: Record<string, number> = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
};

/** יום בשבוע בישראל — Sunday=0 … Saturday=6 */
export function israelWeekdayIndex(at: Date = new Date()): number {
  const long = new Intl.DateTimeFormat("en-US", {
    timeZone: ISRAEL_TIMEZONE,
    weekday: "long",
  }).format(at);
  return WEEKDAY_LONG_TO_INDEX[long] ?? 0;
}

/** YYYY-MM-DD (Israel business day) → אינדקס יום */
export function israelWeekdayIndexFromCountDay(countDay: string): number {
  const [y, m, d] = countDay.split("-").map((part) => parseInt(part, 10));
  if (!y || !m || !d) return israelWeekdayIndex();
  // noon UTC keeps calendar day stable for Israel TZ in edge cases
  return israelWeekdayIndex(new Date(Date.UTC(y, m - 1, d, 12, 0, 0)));
}

export function weekdayFieldForIndex(index: number): WeekdayMinimumField {
  const clamped = Math.max(0, Math.min(6, index));
  return WEEKDAY_MINIMUM_FIELDS[clamped];
}

export function weekdayFieldForDate(at: Date = new Date()): WeekdayMinimumField {
  return weekdayFieldForIndex(israelWeekdayIndex(at));
}

export function weekdayFieldForCountDay(countDay: string): WeekdayMinimumField {
  return weekdayFieldForIndex(israelWeekdayIndexFromCountDay(countDay));
}

function finiteNonNegative(n: number | null | undefined): number | null {
  if (n == null) return null;
  const v = Number(n);
  if (!Number.isFinite(v)) return null;
  return Math.max(0, v);
}

/**
 * מינימום להיום:
 * עמודת היום → placement.minimumQuantity → product.minimumQuantity → 0
 */
export function resolveTodayMinimum(
  placement: PlacementWeekdayMinimums | null | undefined,
  productMinimum: number | null | undefined,
  at?: Date,
): number {
  const dayField = weekdayFieldForDate(at ?? new Date());
  const dayMin = finiteNonNegative(placement?.[dayField]);
  if (dayMin != null) return dayMin;

  const placementLegacy = finiteNonNegative(placement?.minimumQuantity);
  if (placementLegacy != null) return placementLegacy;

  const productMin = finiteNonNegative(productMinimum);
  if (productMin != null) return productMin;

  return 0;
}

export function resolveTodayMinimumForCountDay(
  placement: PlacementWeekdayMinimums | null | undefined,
  productMinimum: number | null | undefined,
  countDay: string,
): number {
  const dayField = weekdayFieldForCountDay(countDay);
  const dayMin = finiteNonNegative(placement?.[dayField]);
  if (dayMin != null) return dayMin;

  const placementLegacy = finiteNonNegative(placement?.minimumQuantity);
  if (placementLegacy != null) return placementLegacy;

  const productMin = finiteNonNegative(productMinimum);
  if (productMin != null) return productMin;

  return 0;
}

export function emptyWeekdayValues(): WeekdayMinimumValues {
  return {
    minimumSun: null,
    minimumMon: null,
    minimumTue: null,
    minimumWed: null,
    minimumThu: null,
    minimumFri: null,
    minimumSat: null,
  };
}

export function placementToWeekdayValues(
  placement: PlacementWeekdayMinimums | null | undefined,
): WeekdayMinimumValues {
  const out = emptyWeekdayValues();
  for (const field of WEEKDAY_MINIMUM_FIELDS) {
    const v = placement?.[field];
    out[field] = v == null ? null : finiteNonNegative(v);
  }
  return out;
}

export function parseWeekdayMinimumInput(
  raw: unknown,
): number | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return n;
}
