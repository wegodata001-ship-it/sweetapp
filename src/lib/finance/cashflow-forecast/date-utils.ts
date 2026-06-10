import { israelCalendarDateString } from "@/lib/staff/work-date";

export function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseDateKey(input: string | null | undefined): string | null {
  if (!input?.trim()) return null;
  const d = new Date(input.trim());
  if (!Number.isFinite(d.getTime())) return null;
  return toDateKey(d);
}

export function defaultForecastRange(): { dateFrom: string; dateTo: string } {
  const dateFrom = israelCalendarDateString();
  const end = new Date();
  end.setDate(end.getDate() + 90);
  return { dateFrom, dateTo: toDateKey(end) };
}

export function resolveForecastRange(params?: { dateFrom?: string; dateTo?: string }): {
  dateFrom: string;
  dateTo: string;
} {
  const defaults = defaultForecastRange();
  const dateFrom = parseDateKey(params?.dateFrom) ?? defaults.dateFrom;
  const dateTo = parseDateKey(params?.dateTo) ?? defaults.dateTo;
  if (dateFrom <= dateTo) return { dateFrom, dateTo };
  return { dateFrom: dateTo, dateTo: dateFrom };
}

export function isDateInRange(date: string, from: string, to: string): boolean {
  return date >= from && date <= to;
}
