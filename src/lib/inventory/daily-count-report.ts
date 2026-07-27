/**
 * דוח סיכום ספירות מלאי יומי.
 *
 * הדוח קורא בלבד: הוא לא כותב, לא משנה ספירות ולא נוגע בלוגיקת הספירה.
 * האגרגציה מופרדת משליפת הנתונים (aggregateDailyReport) כדי שתהיה ניתנת לבדיקה
 * ללא מסד נתונים.
 */
import { prismaAny } from "@/lib/prisma";

/** YYYY-MM-DD לפי זמן מקומי — כמו שאר מודול הספירה */
export function localDay(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function normalizeReportDay(raw: string | null | undefined): string {
  const value = raw?.trim();
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  if (value) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return localDay(parsed);
  }
  return localDay();
}

/** גבולות היום בזמן מקומי — [חצות, חצות הבא) */
export function dayRange(day: string): { start: Date; end: Date } {
  return daySpanRange(day, day);
}

/** גבולות טווח ימים בזמן מקומי — [חצות של from, חצות שאחרי to) */
export function daySpanRange(from: string, to: string): { start: Date; end: Date } {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  const start = new Date(fy, (fm ?? 1) - 1, fd ?? 1, 0, 0, 0, 0);
  const end = new Date(ty, (tm ?? 1) - 1, (td ?? 1) + 1, 0, 0, 0, 0);
  return { start, end };
}

export type DailyReportSessionRow = {
  sessionId: string;
  sessionNumber: number;
  locationId: string | null;
  locationName: string;
  countedByName: string;
  /** יום הספירה כ־YYYY-MM-DD — נדרש בדוח שמשתרע על כמה ימים */
  day: string;
  startedAt: string | null;
  endedAt: string;
  /** null כשאין שעת התחלה מתועדת (סשנים מלפני התוספת) */
  durationMinutes: number | null;
  productCount: number;
  matchCount: number;
  shortageCount: number;
  surplusCount: number;
  totalCountedQty: number;
  status: string;
};

export type DailyReportLocationRow = {
  locationKey: string;
  locationName: string;
  sessionCount: number;
  productCount: number;
  matchCount: number;
  shortageCount: number;
  surplusCount: number;
  totalCountedQty: number;
  addedCount: number;
  removedCount: number;
};

export type DailyReportProductLine = {
  sessionNumber: number;
  locationName: string;
  productName: string;
  barcode: string;
  unit: string;
  previousQuantity: number;
  currentQuantity: number;
  difference: number;
  minimumQuantity: number;
  /** כמה חסר כדי להגיע למינימום — 0 כשאין חוסר */
  shortageVsMinimum: number;
  workersText: string;
};

export type DailyReportRemovedRow = {
  locationName: string;
  productName: string;
  removedAt: string;
  removedByName: string;
  reason: string;
};

export type InventoryDailyReport = {
  /** תאריך הדוח. בטווח מרובה ימים זהו היום הראשון — ראו from/to */
  day: string;
  /** תחילת הטווח כ־YYYY-MM-DD. שווה ל־to בדוח של יום בודד */
  from: string;
  to: string;
  /** true כשהדוח משתרע על יותר מיום אחד */
  isRange: boolean;
  generatedAt: string;
  sessionCount: number;
  /** כמה מיקומי אחסון נספרו בפועל בטווח */
  locationsCounted: number;
  totals: {
    productsChecked: number;
    ok: number;
    shortage: number;
    surplus: number;
    /** חריגות = חוסרים + עודפים */
    anomalies: number;
    totalCountedQty: number;
    addedDuringCount: number;
    removedFromCount: number;
    /** סכום משכי הספירות שיש להן שעת התחלה מתועדת */
    totalDurationMinutes: number;
    /** ממוצע על אותן ספירות בלבד. null כשאף ספירה לא תועדה */
    avgDurationMinutes: number | null;
    /** כמה ספירות נכללו בחישוב המשך */
    sessionsWithDuration: number;
  };
  /** מי ביצע ספירות באותו יום */
  counters: string[];
  firstCountAt: string | null;
  lastCountAt: string | null;
  byLocation: DailyReportLocationRow[];
  sessions: DailyReportSessionRow[];
  lines: DailyReportProductLine[];
  removedRows: DailyReportRemovedRow[];
  /** true כשמספר השורות חרג מהתקרה ולכן הפירוט קוצר */
  linesTruncated: boolean;
};

/** תקרת שורות פירוט — מגן על זיכרון ועל גודל הקבצים במסמך יומי גדול */
export const MAX_REPORT_LINES = 3000;

type RawWorkerLine = {
  workerDisplayName: string;
  workerWorkArea: string;
  countedQuantity: number;
};

export type RawSession = {
  id: string;
  sessionNumber: number;
  locationId: string | null;
  locationName: string;
  status: string;
  startedAt: Date | null;
  createdAt: Date;
  productCount: number;
  matchCount: number;
  shortageCount: number;
  surplusCount: number;
  totalCountedQty: number;
  countedBy: { fullName: string } | null;
  lines: Array<{
    previousQuantity: number;
    currentQuantity: number;
    difference: number;
    inventoryProduct: {
      name: string;
      nameHe: string | null;
      barcode: string | null;
      unit: string | null;
      minimumQuantity: number;
    } | null;
    workerLines: RawWorkerLine[];
  }>;
};

export type RawExclusion = {
  /** מפתח הסבב כפי שנשמר בהסרה — אותה מוסכמה כמו shelfLocationKey */
  locationKey: string;
  locationName: string;
  productName: string;
  removedAt: Date;
  reason: string | null;
  removedBy: { fullName: string } | null;
  inventoryProduct: { name: string; nameHe: string | null } | null;
};

export type RawPlacement = {
  locationId: string;
  location: { name: string } | null;
};

const UNKNOWN_LOCATION = "—";

function locationKeyOf(locationId: string | null, locationName: string): string {
  return locationId?.trim() || `name:${locationName.trim().toLowerCase()}`;
}

/** משך בדקות — רק כשיש שעת התחלה סבירה. אחרת null (לא 0, כדי לא להמציא נתון) */
export function sessionDurationMinutes(
  startedAt: Date | null,
  endedAt: Date,
): number | null {
  if (!startedAt) return null;
  const ms = endedAt.getTime() - startedAt.getTime();
  if (!Number.isFinite(ms) || ms < 0 || ms > 24 * 60 * 60_000) return null;
  return Math.max(1, Math.round(ms / 60_000));
}

/**
 * בניית הדוח מהנתונים הגולמיים. פונקציה טהורה — אותו קלט, אותו פלט.
 */
export function aggregateDailyReport(params: {
  day: string;
  /** גבולות הטווח. ברירת מחדל: יום בודד (from = to = day) */
  from?: string;
  to?: string;
  sessions: RawSession[];
  exclusions: RawExclusion[];
  newPlacements: RawPlacement[];
  now?: Date;
}): InventoryDailyReport {
  const { day, sessions, exclusions, newPlacements } = params;
  const now = params.now ?? new Date();
  const from = params.from ?? day;
  const to = params.to ?? day;

  const byLocation = new Map<string, DailyReportLocationRow>();
  /**
   * שורת מיקום אחת לכל מדף. המפתח הוא locationId (או name:<שם> למדפי טקסט),
   * ולכן ספירה, הסרה והוספה של אותו מדף מתאחדות לשורה אחת ולא מייצרות כפילות.
   */
  const ensureLocation = (key: string, locationName: string) => {
    const name = locationName?.trim() || UNKNOWN_LOCATION;
    let row = byLocation.get(key);
    if (!row) {
      row = {
        locationKey: key,
        locationName: name,
        sessionCount: 0,
        productCount: 0,
        matchCount: 0,
        shortageCount: 0,
        surplusCount: 0,
        totalCountedQty: 0,
        addedCount: 0,
        removedCount: 0,
      };
      byLocation.set(key, row);
    }
    return row;
  };

  const sessionRows: DailyReportSessionRow[] = [];
  const lines: DailyReportProductLine[] = [];
  const counters = new Set<string>();
  let linesTruncated = false;

  const ordered = [...sessions].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  );

  for (const session of ordered) {
    const locationName = session.locationName.trim() || UNKNOWN_LOCATION;
    const countedByName = session.countedBy?.fullName?.trim() || UNKNOWN_LOCATION;
    if (session.countedBy?.fullName?.trim()) counters.add(session.countedBy.fullName.trim());

    sessionRows.push({
      sessionId: session.id,
      sessionNumber: session.sessionNumber,
      locationId: session.locationId,
      locationName,
      countedByName,
      day: localDay(session.createdAt),
      startedAt: session.startedAt?.toISOString() ?? null,
      endedAt: session.createdAt.toISOString(),
      durationMinutes: sessionDurationMinutes(session.startedAt, session.createdAt),
      productCount: session.productCount,
      matchCount: session.matchCount,
      shortageCount: session.shortageCount,
      surplusCount: session.surplusCount,
      totalCountedQty: session.totalCountedQty,
      status: session.status,
    });

    const locationRow = ensureLocation(
      locationKeyOf(session.locationId, locationName),
      locationName,
    );
    locationRow.sessionCount += 1;
    locationRow.productCount += session.productCount;
    locationRow.matchCount += session.matchCount;
    locationRow.shortageCount += session.shortageCount;
    locationRow.surplusCount += session.surplusCount;
    locationRow.totalCountedQty += session.totalCountedQty;

    for (const line of session.lines) {
      if (lines.length >= MAX_REPORT_LINES) {
        linesTruncated = true;
        break;
      }
      const product = line.inventoryProduct;
      const minimumQuantity = product?.minimumQuantity ?? 0;
      lines.push({
        sessionNumber: session.sessionNumber,
        locationName,
        productName: product?.nameHe?.trim() || product?.name || UNKNOWN_LOCATION,
        barcode: product?.barcode ?? "",
        unit: product?.unit ?? "",
        previousQuantity: line.previousQuantity,
        currentQuantity: line.currentQuantity,
        difference: line.difference,
        minimumQuantity,
        shortageVsMinimum:
          minimumQuantity > 0 ? Math.max(0, minimumQuantity - line.currentQuantity) : 0,
        workersText: line.workerLines
          .map(
            (w) =>
              `${w.workerDisplayName || UNKNOWN_LOCATION}${
                w.workerWorkArea ? ` (${w.workerWorkArea})` : ""
              }: ${w.countedQuantity}`,
          )
          .join(" | "),
      });
    }
  }

  const removedRows: DailyReportRemovedRow[] = exclusions
    .map((row) => ({
      locationName: row.locationName?.trim() || UNKNOWN_LOCATION,
      productName:
        row.productName?.trim() ||
        row.inventoryProduct?.nameHe?.trim() ||
        row.inventoryProduct?.name ||
        UNKNOWN_LOCATION,
      removedAt: row.removedAt.toISOString(),
      removedByName: row.removedBy?.fullName?.trim() || UNKNOWN_LOCATION,
      reason: row.reason?.trim() ?? "",
    }))
    .sort((a, b) => a.removedAt.localeCompare(b.removedAt));

  for (const row of exclusions) {
    ensureLocation(row.locationKey, row.locationName).removedCount += 1;
  }
  for (const placement of newPlacements) {
    const name = placement.location?.name ?? "";
    ensureLocation(locationKeyOf(placement.locationId, name), name).addedCount += 1;
  }

  const totals = sessionRows.reduce(
    (acc, s) => {
      acc.productsChecked += s.productCount;
      acc.ok += s.matchCount;
      acc.shortage += s.shortageCount;
      acc.surplus += s.surplusCount;
      acc.totalCountedQty += s.totalCountedQty;
      // הממוצע מחושב רק על ספירות עם שעת התחלה מתועדת, אחרת ספירות ישנות
      // (startedAt = null) היו מושכות אותו כלפי מטה כאילו ארכו אפס דקות
      if (s.durationMinutes != null) {
        acc.totalDurationMinutes += s.durationMinutes;
        acc.sessionsWithDuration += 1;
      }
      return acc;
    },
    {
      productsChecked: 0,
      ok: 0,
      shortage: 0,
      surplus: 0,
      anomalies: 0,
      totalCountedQty: 0,
      addedDuringCount: newPlacements.length,
      removedFromCount: exclusions.length,
      totalDurationMinutes: 0,
      avgDurationMinutes: null as number | null,
      sessionsWithDuration: 0,
    },
  );
  totals.anomalies = totals.shortage + totals.surplus;
  totals.avgDurationMinutes =
    totals.sessionsWithDuration > 0
      ? Math.round(totals.totalDurationMinutes / totals.sessionsWithDuration)
      : null;

  const locationRows = [...byLocation.values()].sort((a, b) => {
    if (b.sessionCount !== a.sessionCount) return b.sessionCount - a.sessionCount;
    return a.locationName.localeCompare(b.locationName, "he");
  });

  return {
    day,
    from,
    to,
    isRange: from !== to,
    generatedAt: now.toISOString(),
    sessionCount: sessionRows.length,
    // מיקום נספר בפועל — שורות מיקום שנוצרו רק מהוספה/הסרה אינן נחשבות
    locationsCounted: locationRows.filter((l) => l.sessionCount > 0).length,
    totals,
    counters: [...counters].sort((a, b) => a.localeCompare(b, "he")),
    firstCountAt: sessionRows[0]?.endedAt ?? null,
    lastCountAt: sessionRows[sessionRows.length - 1]?.endedAt ?? null,
    byLocation: locationRows,
    sessions: sessionRows,
    lines,
    removedRows,
    linesTruncated,
  };
}

/** שליפת נתוני יום בודד ובניית הדוח */
export async function loadInventoryDailyReport(
  day: string,
): Promise<InventoryDailyReport> {
  const reportDay = normalizeReportDay(day);
  return loadInventoryReportRange(reportDay, reportDay);
}

/**
 * שליפת נתוני טווח ימים ובניית הדוח.
 * זהו מסלול השליפה היחיד — דוח של יום בודד הוא טווח שבו from = to.
 */
export async function loadInventoryReportRange(
  fromDay: string,
  toDay: string,
): Promise<InventoryDailyReport> {
  const from = normalizeReportDay(fromDay);
  const to = normalizeReportDay(toDay);
  const { start, end } = daySpanRange(from, to);

  const [sessions, exclusions, newPlacements] = await Promise.all([
    prismaAny.inventoryCountSession.findMany({
      where: { createdAt: { gte: start, lt: end } },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        sessionNumber: true,
        locationId: true,
        locationName: true,
        status: true,
        startedAt: true,
        createdAt: true,
        productCount: true,
        matchCount: true,
        shortageCount: true,
        surplusCount: true,
        totalCountedQty: true,
        countedBy: { select: { fullName: true } },
        lines: {
          orderBy: { createdAt: "asc" },
          select: {
            previousQuantity: true,
            currentQuantity: true,
            difference: true,
            inventoryProduct: {
              select: {
                name: true,
                nameHe: true,
                barcode: true,
                unit: true,
                minimumQuantity: true,
              },
            },
            workerLines: {
              orderBy: { createdAt: "asc" },
              select: {
                workerDisplayName: true,
                workerWorkArea: true,
                countedQuantity: true,
              },
            },
          },
        },
      },
    }) as Promise<RawSession[]>,

    prismaAny.inventoryCountExclusion.findMany({
      // countDay הוא YYYY-MM-DD, ולכן השוואת מחרוזות שקולה להשוואת תאריכים
      where: { countDay: { gte: from, lte: to }, isRemoved: true },
      orderBy: { removedAt: "asc" },
      select: {
        locationKey: true,
        locationName: true,
        productName: true,
        removedAt: true,
        reason: true,
        removedBy: { select: { fullName: true } },
        inventoryProduct: { select: { name: true, nameHe: true } },
      },
    }) as Promise<RawExclusion[]>,

    /**
     * "מוצרים שנוספו במהלך הספירה" = שיוכי מוצר-למדף חדשים שנוצרו באותו יום.
     * זה הנתון המתועד היחיד שאינו ניחוש: הוספת מוצר למדף יוצרת שורה עם createdAt.
     */
    prismaAny.inventoryProductOnLocation.findMany({
      where: { createdAt: { gte: start, lt: end } },
      select: { locationId: true, location: { select: { name: true } } },
    }) as Promise<RawPlacement[]>,
  ]);

  return aggregateDailyReport({ day: from, from, to, sessions, exclusions, newPlacements });
}
