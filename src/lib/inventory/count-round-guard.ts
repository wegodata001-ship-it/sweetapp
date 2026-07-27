/**
 * זיהוי ספירות שכבר נשמרו היום לאותו מיקום.
 *
 * שמירה חוזרת יוצרת סשן נוסף ולא מעדכנת את הקיים — וכך נוצרות ספירות כפולות
 * שמעוותות את ההפרשים בדוחות. המסך מציג אזהרה על סמך הנתונים כאן, אך אינו
 * חוסם שמירה: ספירה חוזרת מכוונת היא תרחיש לגיטימי.
 */

import { prismaAny } from "@/lib/prisma";
import { ACTIVE_SESSION_WHERE } from "./count-session-status";
import type { CountRoundScope } from "./count-exclusions";

export type ExistingCountToday = {
  /** כמה סשנים כבר נשמרו היום למיקום הזה */
  sessionCount: number;
  lastSessionNumber: number | null;
  lastSavedAt: string | null;
  lastCountedByName: string | null;
};

/** גבולות היום המקומי מתוך מפתח YYYY-MM-DD */
function localDayBounds(countDay: string): { start: Date; end: Date } {
  const [y, m, d] = countDay.split("-").map((part) => Number(part));
  const start = new Date(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

export async function loadExistingCountToday(
  scope: Pick<CountRoundScope, "locationId" | "locationName" | "countDay">,
): Promise<ExistingCountToday> {
  const { start, end } = localDayBounds(scope.countDay);
  const locationWhere = scope.locationId
    ? { locationId: scope.locationId }
    : { locationName: scope.locationName };

  const sessions = (await prismaAny.inventoryCountSession.findMany({
    where: {
      ...ACTIVE_SESSION_WHERE,
      ...locationWhere,
      createdAt: { gte: start, lt: end },
    },
    orderBy: { createdAt: "desc" },
    select: {
      sessionNumber: true,
      createdAt: true,
      countedBy: { select: { fullName: true } },
    },
  })) as {
    sessionNumber: number;
    createdAt: Date;
    countedBy: { fullName: string } | null;
  }[];

  const last = sessions[0];
  return {
    sessionCount: sessions.length,
    lastSessionNumber: last?.sessionNumber ?? null,
    lastSavedAt: last ? new Date(last.createdAt).toISOString() : null,
    lastCountedByName: last?.countedBy?.fullName ?? null,
  };
}
