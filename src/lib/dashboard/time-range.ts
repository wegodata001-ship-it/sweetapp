export type DashboardTimeRange = "today" | "week" | "month";

export type RangeKeyed<T> = Record<DashboardTimeRange, T>;

function monthStart(offset = 0, anchor = new Date()) {
  return new Date(anchor.getFullYear(), anchor.getMonth() + offset, 1, 0, 0, 0, 0);
}

/** גבולות תאריך לפי טווח — שבוע = מתחילת השבוע (יום ראשון) עד היום */
export function boundsForDashboardRange(
  range: DashboardTimeRange,
  anchor = new Date(),
): { from: Date; to: Date } {
  const today0 = new Date(anchor);
  today0.setHours(0, 0, 0, 0);
  const todayEnd = new Date(today0);
  todayEnd.setHours(23, 59, 59, 999);

  if (range === "today") {
    return { from: today0, to: todayEnd };
  }

  if (range === "week") {
    const from = new Date(today0);
    from.setDate(from.getDate() - from.getDay());
    from.setHours(0, 0, 0, 0);
    return { from, to: todayEnd };
  }

  return { from: monthStart(0, anchor), to: todayEnd };
}
