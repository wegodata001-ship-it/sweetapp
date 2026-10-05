import { boundsForDashboardRange, type DashboardTimeRange } from "@/lib/dashboard/time-range";
import { parseBusinessDocDate } from "@/lib/finance/document-business-date";

export type DashboardPeriod = DashboardTimeRange | "custom";

export type DashboardPeriodSelection = {
  period: DashboardPeriod;
  from: string;
  to: string;
};

export function ymdLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function defaultDashboardPeriod(anchor = new Date()): DashboardPeriodSelection {
  const { from, to } = boundsForDashboardRange("month", anchor);
  return { period: "month", from: ymdLocal(from), to: ymdLocal(to) };
}

export function selectionForPreset(
  period: DashboardTimeRange,
  anchor = new Date(),
): DashboardPeriodSelection {
  const { from, to } = boundsForDashboardRange(period, anchor);
  return { period, from: ymdLocal(from), to: ymdLocal(to) };
}

export function parseDashboardPeriodSearch(
  params: { get(name: string): string | null },
  anchor = new Date(),
): DashboardPeriodSelection {
  const period = params.get("period");
  if (period === "today" || period === "week" || period === "month") {
    return selectionForPreset(period, anchor);
  }
  if (period === "custom") {
    const from = params.get("from")?.trim() ?? "";
    const to = params.get("to")?.trim() ?? "";
    if (parseBusinessDocDate(from) && parseBusinessDocDate(to) && from <= to) {
      return { period: "custom", from, to };
    }
  }
  return defaultDashboardPeriod(anchor);
}

export function dashboardPeriodSearch(selection: DashboardPeriodSelection): string {
  const q = new URLSearchParams();
  q.set("period", selection.period);
  if (selection.period === "custom") {
    q.set("from", selection.from);
    q.set("to", selection.to);
  }
  return q.toString();
}

export function dashboardCacheKey(prefix: string, selection: DashboardPeriodSelection): string {
  if (selection.period === "custom") {
    return `${prefix}:custom:${selection.from}:${selection.to}`;
  }
  return `${prefix}:preset`;
}

export function validateCustomRange(from: string, to: string): "invalid" | "order" | null {
  if (!parseBusinessDocDate(from) || !parseBusinessDocDate(to)) return "invalid";
  if (from > to) return "order";
  return null;
}

export function customRangeBounds(from: string, to: string): { from: Date; to: Date } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) return null;
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  if (!fy || !fm || !fd || !ty || !tm || !td) return null;
  return {
    from: new Date(fy, fm - 1, fd, 0, 0, 0, 0),
    to: new Date(ty, tm - 1, td, 23, 59, 59, 999),
  };
}

export function isFullCalendarMonth(from: string, to: string): boolean {
  const start = parseBusinessDocDate(from);
  const end = parseBusinessDocDate(to);
  if (!start || !end) return false;
  if (start.getUTCDate() !== 1) return false;
  if (start.getUTCFullYear() !== end.getUTCFullYear() || start.getUTCMonth() !== end.getUTCMonth()) {
    return false;
  }
  const last = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));
  return end.getUTCDate() === last.getUTCDate();
}

export function localizedMonthName(d: Date, bcp47: string): string {
  return d.toLocaleDateString(bcp47, { month: "long" });
}

export function formatCustomPeriodLabel(from: string, to: string, bcp47: string): string {
  if (isFullCalendarMonth(from, to)) {
    const start = parseBusinessDocDate(from)!;
    const month = localizedMonthName(new Date(start.getUTCFullYear(), start.getUTCMonth(), 1), bcp47);
    return `${month} ${start.getUTCFullYear()}`;
  }
  const short = (iso: string) => {
    const [y, m, d] = iso.split("-");
    return `${d}/${m}/${y.slice(2)}`;
  };
  return `${short(from)} - ${short(to)}`;
}
