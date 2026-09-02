import type { Prisma } from "@prisma/client";
import { prismaAny } from "@/lib/prisma";
import { ensureLocationSchemaColumns } from "@/lib/inventory/ensure-location-schema";
import { israelCreatedAtRange, israelYmd } from "@/lib/inventory/count-history-audit";
import { COUNT_SESSION_VOID } from "@/lib/inventory/count-session-status";

export type CountSessionListItem = {
  id: string;
  sessionNumber: number;
  locationId: string | null;
  locationName: string;
  countDate: string;
  createdAt: string;
  countedByUserId: string | null;
  countedByName: string | null;
  productCount: number;
  shortageCount: number;
  surplusCount: number;
  matchCount: number;
  /** מוצרים עם שינוי כמות (previous ≠ current) */
  changedCount: number;
  /** מוצרים ללא שינוי */
  unchangedCount: number;
  /** Positive→0 בתוך הסשן */
  positiveToZeroCount: number;
  /** ירידות >50% */
  significantDropCount: number;
  totalCountedQty: number;
  status: string;
};

export type CountSessionWorkerLine = {
  inventoryLocationWorkerId: string;
  workerDisplayName: string;
  workerWorkArea: string;
  countedQuantity: number;
  createdAt: string;
};

export type CountSessionProductLine = {
  id: string;
  inventoryProductId: string;
  name: string;
  nameHe: string | null;
  nameAr: string | null;
  nameEn: string | null;
  barcode: string | null;
  sku: string | null;
  unit: string | null;
  minimumQuantity: number;
  previousQuantity: number;
  currentQuantity: number;
  difference: number;
  positiveToZero: boolean;
  significantDrop: boolean;
  workers: CountSessionWorkerLine[];
};

export type CountSessionDetail = CountSessionListItem & {
  lines: CountSessionProductLine[];
};

export type DailyLocationHistoryRow = {
  day: string;
  locationId: string | null;
  locationName: string;
  sessionCount: number;
  productCount: number;
  expectedProducts: number;
  /** not_started | partial | completed */
  coverageStatus: "not_started" | "partial" | "completed";
  sessions: Array<{
    id: string;
    sessionNumber: number;
    createdAt: string;
    productCount: number;
    countedByName: string | null;
    status: string;
  }>;
};

function serializeSession(row: {
  id: string;
  sessionNumber: number;
  locationId: string | null;
  locationName: string;
  countDate: Date;
  createdAt: Date;
  productCount: number;
  shortageCount: number;
  surplusCount: number;
  matchCount: number;
  totalCountedQty: number;
  status: string;
  countedByUserId?: string | null;
  countedBy?: { fullName: string } | null;
  changedCount?: number;
  unchangedCount?: number;
  positiveToZeroCount?: number;
  significantDropCount?: number;
}): CountSessionListItem {
  return {
    id: row.id,
    sessionNumber: row.sessionNumber,
    locationId: row.locationId,
    locationName: row.locationName,
    countDate: row.countDate.toISOString(),
    createdAt: row.createdAt.toISOString(),
    countedByUserId: row.countedByUserId ?? null,
    countedByName: row.countedBy?.fullName ?? null,
    productCount: row.productCount,
    shortageCount: row.shortageCount,
    surplusCount: row.surplusCount,
    matchCount: row.matchCount,
    changedCount: row.changedCount ?? 0,
    unchangedCount: row.unchangedCount ?? row.matchCount,
    positiveToZeroCount: row.positiveToZeroCount ?? 0,
    significantDropCount: row.significantDropCount ?? 0,
    totalCountedQty: row.totalCountedQty,
    status: row.status,
  };
}

function lineStats(
  lines: Array<{ previousQuantity: number; currentQuantity: number; difference: number }>,
) {
  let changedCount = 0;
  let unchangedCount = 0;
  let positiveToZeroCount = 0;
  let significantDropCount = 0;
  for (const line of lines) {
    if (Math.abs(line.difference) < 1e-9) unchangedCount += 1;
    else changedCount += 1;
    if (line.previousQuantity > 0 && line.currentQuantity === 0) positiveToZeroCount += 1;
    if (line.previousQuantity > 0 && line.currentQuantity < line.previousQuantity * 0.5) {
      significantDropCount += 1;
    }
  }
  return { changedCount, unchangedCount, positiveToZeroCount, significantDropCount };
}

export async function listCountSessions(params: {
  locationId?: string | null;
  locationName?: string | null;
  /** כש־true ואין location — כל המיקומים (למנהל) */
  allLocations?: boolean;
  dateFrom?: string | null;
  dateTo?: string | null;
  countedByUserId?: string | null;
  /** חיפוש לפי שם מבצע */
  countedBySearch?: string | null;
  status?: string | null;
  /** חיפוש שם מוצר בתוך שורות הסשן */
  productSearch?: string | null;
  productId?: string | null;
  take?: number;
  /** cursor = createdAt ISO של הרשומה האחרונה */
  cursorCreatedAt?: string | null;
  cursorId?: string | null;
}): Promise<{ rows: CountSessionListItem[]; nextCursor: { createdAt: string; id: string } | null }> {
  const take = Math.min(100, Math.max(1, params.take ?? 40));
  const locationId = params.locationId?.trim() || null;
  const locationName = params.locationName?.trim() || null;

  const where: Prisma.InventoryCountSessionWhereInput = {};

  if (locationId) {
    where.locationId = locationId;
  } else if (locationName) {
    where.locationName = { equals: locationName, mode: "insensitive" };
  } else if (!params.allLocations) {
    return { rows: [], nextCursor: null };
  }

  if (params.dateFrom?.trim() && params.dateTo?.trim()) {
    where.createdAt = israelCreatedAtRange(params.dateFrom.trim(), params.dateTo.trim());
  }

  if (params.countedByUserId?.trim()) {
    where.countedByUserId = params.countedByUserId.trim();
  } else if (params.countedBySearch?.trim()) {
    where.countedBy = {
      fullName: { contains: params.countedBySearch.trim(), mode: "insensitive" },
    };
  }

  if (params.status?.trim()) {
    where.status = params.status.trim();
  }

  if (params.productId?.trim()) {
    where.lines = { some: { inventoryProductId: params.productId.trim() } };
  } else if (params.productSearch?.trim()) {
    const q = params.productSearch.trim();
    where.lines = {
      some: {
        inventoryProduct: {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { nameHe: { contains: q, mode: "insensitive" } },
            { nameAr: { contains: q, mode: "insensitive" } },
            { nameEn: { contains: q, mode: "insensitive" } },
            { barcode: { contains: q, mode: "insensitive" } },
            { sku: { contains: q, mode: "insensitive" } },
          ],
        },
      },
    };
  }

  if (params.cursorCreatedAt && params.cursorId) {
    const cursorDate = new Date(params.cursorCreatedAt);
    where.AND = [
      {
        OR: [
          { createdAt: { lt: cursorDate } },
          { createdAt: cursorDate, id: { lt: params.cursorId } },
        ],
      },
    ];
  }

  const rows = await prismaAny.inventoryCountSession.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: take + 1,
    select: {
      id: true,
      sessionNumber: true,
      locationId: true,
      locationName: true,
      countDate: true,
      createdAt: true,
      productCount: true,
      shortageCount: true,
      surplusCount: true,
      matchCount: true,
      totalCountedQty: true,
      status: true,
      countedByUserId: true,
      countedBy: { select: { fullName: true } },
      lines: {
        select: {
          previousQuantity: true,
          currentQuantity: true,
          difference: true,
        },
      },
    },
  });

  const hasMore = rows.length > take;
  const page = hasMore ? rows.slice(0, take) : rows;
  const mapped = page.map(
    (row: {
      id: string;
      sessionNumber: number;
      locationId: string | null;
      locationName: string;
      countDate: Date;
      createdAt: Date;
      productCount: number;
      shortageCount: number;
      surplusCount: number;
      matchCount: number;
      totalCountedQty: number;
      status: string;
      countedByUserId: string | null;
      countedBy: { fullName: string } | null;
      lines: Array<{ previousQuantity: number; currentQuantity: number; difference: number }>;
    }) => {
      const stats = lineStats(row.lines);
      return serializeSession({ ...row, ...stats });
    },
  );

  const last = mapped[mapped.length - 1];
  return {
    rows: mapped,
    nextCursor:
      hasMore && last
        ? { createdAt: last.createdAt, id: last.id }
        : null,
  };
}

export async function getCountSessionDetail(
  sessionId: string,
): Promise<CountSessionDetail | null> {
  await ensureLocationSchemaColumns();
  const row = await prismaAny.inventoryCountSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      sessionNumber: true,
      locationId: true,
      locationName: true,
      countDate: true,
      createdAt: true,
      productCount: true,
      shortageCount: true,
      surplusCount: true,
      matchCount: true,
      totalCountedQty: true,
      status: true,
      countedByUserId: true,
      countedBy: { select: { fullName: true } },
      lines: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          inventoryProductId: true,
          previousQuantity: true,
          currentQuantity: true,
          difference: true,
          minimumQuantity: true,
          inventoryProduct: {
            select: {
              name: true,
              nameHe: true,
              nameAr: true,
              nameEn: true,
              barcode: true,
              sku: true,
              unit: true,
              minimumQuantity: true,
            },
          },
          workerLines: {
            orderBy: { createdAt: "asc" },
            select: {
              inventoryLocationWorkerId: true,
              workerDisplayName: true,
              workerWorkArea: true,
              countedQuantity: true,
              createdAt: true,
              locationWorker: {
                select: { displayName: true, workArea: true, displayOrder: true },
              },
            },
          },
        },
      },
    },
  });

  if (!row) return null;

  const stats = lineStats(row.lines);

  return {
    ...serializeSession({ ...row, ...stats }),
    lines: row.lines.map(
      (line: {
        id: string;
        inventoryProductId: string;
        previousQuantity: number;
        currentQuantity: number;
        difference: number;
        minimumQuantity: number;
        inventoryProduct: {
          name: string;
          nameHe: string | null;
          nameAr: string | null;
          nameEn: string | null;
          barcode: string | null;
          sku: string | null;
          unit: string | null;
          minimumQuantity: number;
        };
        workerLines: {
          inventoryLocationWorkerId: string;
          workerDisplayName: string;
          workerWorkArea: string;
          countedQuantity: number;
          createdAt: Date;
          locationWorker: { displayName: string; workArea: string } | null;
        }[];
      }) => {
        const lineMin = Number(line.minimumQuantity);
        const snapshotMin =
          Number.isFinite(lineMin) && lineMin >= 0
            ? lineMin
            : Math.max(0, Number(line.inventoryProduct.minimumQuantity) || 0);
        const positiveToZero =
          line.previousQuantity > 0 && line.currentQuantity === 0;
        const significantDrop =
          line.previousQuantity > 0 &&
          line.currentQuantity < line.previousQuantity * 0.5;
        return {
          id: line.id,
          inventoryProductId: line.inventoryProductId,
          name: line.inventoryProduct.nameHe?.trim() || line.inventoryProduct.name,
          nameHe: line.inventoryProduct.nameHe,
          nameAr: line.inventoryProduct.nameAr,
          nameEn: line.inventoryProduct.nameEn,
          barcode: line.inventoryProduct.barcode,
          sku: line.inventoryProduct.sku,
          unit: line.inventoryProduct.unit,
          minimumQuantity: snapshotMin,
          previousQuantity: line.previousQuantity,
          currentQuantity: line.currentQuantity,
          difference: line.difference,
          positiveToZero,
          significantDrop,
          workers: line.workerLines.map((w) => ({
            inventoryLocationWorkerId: w.inventoryLocationWorkerId,
            workerDisplayName:
              w.workerDisplayName || w.locationWorker?.displayName || "—",
            workerWorkArea: w.workerWorkArea || w.locationWorker?.workArea || "",
            countedQuantity: w.countedQuantity,
            createdAt: w.createdAt.toISOString(),
          })),
        };
      },
    ),
  };
}

/** תצוגה יומית — רק סשנים שנשמרו באמת (לא פתיחת מסך) */
export async function listDailyCountCoverage(params: {
  dateFrom: string;
  dateTo: string;
  locationId?: string | null;
  allLocations?: boolean;
}): Promise<DailyLocationHistoryRow[]> {
  const locationId = params.locationId?.trim() || null;
  const where: Prisma.InventoryCountSessionWhereInput = {
    createdAt: israelCreatedAtRange(params.dateFrom, params.dateTo),
  };
  if (locationId) where.locationId = locationId;
  else if (!params.allLocations) return [];

  const sessions = await prismaAny.inventoryCountSession.findMany({
    where,
    orderBy: [{ createdAt: "asc" }],
    select: {
      id: true,
      sessionNumber: true,
      locationId: true,
      locationName: true,
      createdAt: true,
      productCount: true,
      status: true,
      countedBy: { select: { fullName: true } },
    },
  });

  const locationIds = [
    ...new Set(
      sessions
        .map((s: { locationId: string | null }) => s.locationId)
        .filter((id: string | null): id is string => Boolean(id)),
    ),
  ];

  const memberCounts = new Map<string, number>();
  if (locationIds.length > 0) {
    const groups = await prismaAny.inventoryProductOnLocation.groupBy({
      by: ["locationId"],
      where: { locationId: { in: locationIds } },
      _count: { _all: true },
    });
    for (const g of groups as Array<{ locationId: string; _count: { _all: number } }>) {
      memberCounts.set(g.locationId, g._count._all);
    }
  }

  type Bucket = {
    day: string;
    locationId: string | null;
    locationName: string;
    sessions: DailyLocationHistoryRow["sessions"];
    productIds: Set<string>;
  };

  const buckets = new Map<string, Bucket>();

  for (const s of sessions as Array<{
    id: string;
    sessionNumber: number;
    locationId: string | null;
    locationName: string;
    createdAt: Date;
    productCount: number;
    status: string;
    countedBy: { fullName: string } | null;
  }>) {
    const day = israelYmd(s.createdAt);
    const key = `${day}::${s.locationId ?? s.locationName}`;
    let b = buckets.get(key);
    if (!b) {
      b = {
        day,
        locationId: s.locationId,
        locationName: s.locationName,
        sessions: [],
        productIds: new Set(),
      };
      buckets.set(key, b);
    }
    b.sessions.push({
      id: s.id,
      sessionNumber: s.sessionNumber,
      createdAt: s.createdAt.toISOString(),
      productCount: s.productCount,
      countedByName: s.countedBy?.fullName ?? null,
      status: s.status,
    });
  }

  // טעינת product IDs לסשנים פעילים לחישוב כיסוי מדויק יותר
  const activeSessionIds = sessions
    .filter((s: { status: string }) => s.status !== COUNT_SESSION_VOID)
    .map((s: { id: string }) => s.id);
  if (activeSessionIds.length > 0) {
    const lines = await prismaAny.inventoryCount.findMany({
      where: { sessionId: { in: activeSessionIds } },
      select: { sessionId: true, inventoryProductId: true, locationId: true, createdAt: true },
    });
    for (const line of lines as Array<{
      sessionId: string | null;
      inventoryProductId: string;
      locationId: string | null;
      createdAt: Date;
    }>) {
      if (!line.sessionId) continue;
      const day = israelYmd(line.createdAt);
      const sess = sessions.find((x: { id: string }) => x.id === line.sessionId) as
        | { locationId: string | null; locationName: string }
        | undefined;
      if (!sess) continue;
      const key = `${day}::${sess.locationId ?? sess.locationName}`;
      buckets.get(key)?.productIds.add(line.inventoryProductId);
    }
  }

  const result: DailyLocationHistoryRow[] = [];
  for (const b of buckets.values()) {
    const expected =
      (b.locationId ? memberCounts.get(b.locationId) : undefined) ??
      Math.max(...b.sessions.map((s) => s.productCount), 0);
    const productCount = b.productIds.size || Math.max(...b.sessions.map((s) => s.productCount), 0);
    const hasActive = b.sessions.some((s) => s.status !== COUNT_SESSION_VOID);
    let coverageStatus: DailyLocationHistoryRow["coverageStatus"] = "not_started";
    if (hasActive && productCount > 0) {
      coverageStatus =
        expected > 0 && productCount >= expected ? "completed" : "partial";
    } else if (b.sessions.length > 0) {
      coverageStatus = "partial";
    }
    result.push({
      day: b.day,
      locationId: b.locationId,
      locationName: b.locationName,
      sessionCount: b.sessions.length,
      productCount,
      expectedProducts: expected,
      coverageStatus,
      sessions: b.sessions,
    });
  }

  result.sort((a, b) => {
    if (a.day !== b.day) return a.day < b.day ? 1 : -1;
    return a.locationName.localeCompare(b.locationName, "he");
  });

  return result;
}
