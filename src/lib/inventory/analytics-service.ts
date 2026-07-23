import { prismaAny } from "@/lib/prisma";
import type {
  AnalyticsDashboardDto,
  AnalyticsDrillRow,
  AnalyticsDrillType,
  AnalyticsFilters,
  AnalyticsRange,
  CriticalBuckets,
  ForecastItem,
  HeatCell,
  LocationStat,
  NamedQty,
  TrendPoint,
  WorkerStat,
} from "@/lib/inventory/analytics-types";

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

export function resolveAnalyticsWindow(input: {
  range?: string | null;
  from?: string | null;
  to?: string | null;
}): { from: Date; to: Date; range: AnalyticsRange } {
  const to = input.to ? endOfDay(new Date(input.to)) : endOfDay(new Date());
  const range = (input.range as AnalyticsRange) || "month";
  if (input.from) {
    return { from: startOfDay(new Date(input.from)), to, range: "custom" };
  }
  const from = startOfDay(new Date(to));
  if (range === "day") from.setDate(from.getDate() - 1);
  else if (range === "week") from.setDate(from.getDate() - 7);
  else if (range === "year") from.setFullYear(from.getFullYear() - 1);
  else from.setDate(from.getDate() - 30);
  return { from, to, range: range === "custom" ? "month" : range };
}

type LatestRow = {
  inventoryProductId: string;
  locationId: string | null;
  currentQuantity: number;
  difference: number;
  countDate: Date;
  productName: string;
  minimumQuantity: number;
  category: string;
};

type FilterBits = {
  locationId?: string;
  category?: string;
  productId?: string;
  workerId?: string;
};

async function loadLatestCounts(filters: FilterBits): Promise<LatestRow[]> {
  const params: unknown[] = [];
  const clauses: string[] = [];
  if (filters.locationId) {
    params.push(filters.locationId);
    clauses.push(`c."locationId" = $${params.length}`);
  }
  if (filters.productId) {
    params.push(filters.productId);
    clauses.push(`c."inventoryProductId" = $${params.length}`);
  }
  if (filters.category) {
    params.push(filters.category);
    clauses.push(`p."category" = $${params.length}`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const sql = `
    SELECT DISTINCT ON (c."inventoryProductId", c."locationId")
      c."inventoryProductId",
      c."locationId",
      c."currentQuantity"::float AS "currentQuantity",
      c."difference"::float AS "difference",
      c."countDate",
      COALESCE(NULLIF(p."nameHe", ''), p."name") AS "productName",
      p."minimumQuantity"::float AS "minimumQuantity",
      p."category"
    FROM "InventoryCount" c
    INNER JOIN "InventoryProduct" p ON p.id = c."inventoryProductId"
    ${where}
    ORDER BY c."inventoryProductId", c."locationId", c."countDate" DESC
  `;
  return (await prismaAny.$queryRawUnsafe(sql, ...params)) as LatestRow[];
}

async function loadUsageSeries(
  from: Date,
  to: Date,
  trunc: "day" | "week" | "month" | "year",
  filters: FilterBits,
): Promise<TrendPoint[]> {
  const params: unknown[] = [from, to];
  const clauses = [`c."countDate" >= $1`, `c."countDate" <= $2`];
  if (filters.locationId) {
    params.push(filters.locationId);
    clauses.push(`c."locationId" = $${params.length}`);
  }
  if (filters.productId) {
    params.push(filters.productId);
    clauses.push(`c."inventoryProductId" = $${params.length}`);
  }
  if (filters.category) {
    params.push(filters.category);
    clauses.push(`p."category" = $${params.length}`);
  }
  let workerJoin = "";
  if (filters.workerId) {
    params.push(filters.workerId);
    workerJoin = `INNER JOIN "InventoryCountWorker" w ON w."inventoryCountId" = c.id AND w."inventoryLocationWorkerId" = $${params.length}`;
  }

  const sql = `
    SELECT
      to_char(date_trunc('${trunc}', c."countDate"), 'YYYY-MM-DD') AS period,
      COALESCE(SUM(CASE WHEN c."difference" < 0 THEN -c."difference" ELSE 0 END), 0)::float AS usage,
      COALESCE(SUM(CASE WHEN c."difference" > 0 THEN c."difference" ELSE 0 END), 0)::float AS surplus,
      COUNT(*)::int AS counts
    FROM "InventoryCount" c
    INNER JOIN "InventoryProduct" p ON p.id = c."inventoryProductId"
    ${workerJoin}
    WHERE ${clauses.join(" AND ")}
    GROUP BY 1
    ORDER BY 1 ASC
  `;
  const rows = (await prismaAny.$queryRawUnsafe(sql, ...params)) as Array<{
    period: string;
    usage: number;
    surplus: number;
    counts: number;
  }>;
  return rows.map((r) => ({
    period: r.period,
    usage: Number(r.usage) || 0,
    surplus: Number(r.surplus) || 0,
    counts: Number(r.counts) || 0,
  }));
}

async function loadProductUsage(from: Date, to: Date, filters: FilterBits): Promise<NamedQty[]> {
  const params: unknown[] = [from, to];
  const clauses = [`c."countDate" >= $1`, `c."countDate" <= $2`, `c."difference" < 0`];
  if (filters.locationId) {
    params.push(filters.locationId);
    clauses.push(`c."locationId" = $${params.length}`);
  }
  if (filters.productId) {
    params.push(filters.productId);
    clauses.push(`c."inventoryProductId" = $${params.length}`);
  }
  if (filters.category) {
    params.push(filters.category);
    clauses.push(`p."category" = $${params.length}`);
  }
  let workerJoin = "";
  if (filters.workerId) {
    params.push(filters.workerId);
    workerJoin = `INNER JOIN "InventoryCountWorker" w ON w."inventoryCountId" = c.id AND w."inventoryLocationWorkerId" = $${params.length}`;
  }
  const sql = `
    SELECT
      p.id,
      COALESCE(NULLIF(p."nameHe", ''), p."name") AS name,
      COALESCE(SUM(-c."difference"), 0)::float AS quantity
    FROM "InventoryCount" c
    INNER JOIN "InventoryProduct" p ON p.id = c."inventoryProductId"
    ${workerJoin}
    WHERE ${clauses.join(" AND ")}
    GROUP BY p.id, name
    ORDER BY quantity DESC
    LIMIT 100
  `;
  const rows = (await prismaAny.$queryRawUnsafe(sql, ...params)) as Array<{
    id: string;
    name: string;
    quantity: number;
  }>;
  return rows.map((r) => ({ id: r.id, name: r.name, quantity: Number(r.quantity) || 0 }));
}

async function loadHeatmap(from: Date, to: Date, filters: FilterBits): Promise<HeatCell[]> {
  const params: unknown[] = [from, to];
  const clauses = [`c."createdAt" >= $1`, `c."createdAt" <= $2`];
  if (filters.locationId) {
    params.push(filters.locationId);
    clauses.push(`c."locationId" = $${params.length}`);
  }
  const sql = `
    SELECT
      EXTRACT(DOW FROM c."createdAt")::int AS day,
      EXTRACT(HOUR FROM c."createdAt")::int AS hour,
      COUNT(*)::int AS value
    FROM "InventoryCount" c
    WHERE ${clauses.join(" AND ")}
    GROUP BY 1, 2
  `;
  const rows = (await prismaAny.$queryRawUnsafe(sql, ...params)) as HeatCell[];
  return rows.map((r) => ({ day: Number(r.day), hour: Number(r.hour), value: Number(r.value) }));
}

async function loadWorkerStats(from: Date, to: Date, filters: FilterBits): Promise<WorkerStat[]> {
  const params: unknown[] = [from, to];
  const clauses = [`c."countDate" >= $1`, `c."countDate" <= $2`];
  if (filters.locationId) {
    params.push(filters.locationId);
    clauses.push(`c."locationId" = $${params.length}`);
  }
  if (filters.workerId) {
    params.push(filters.workerId);
    clauses.push(`w."inventoryLocationWorkerId" = $${params.length}`);
  }
  const sql = `
    SELECT
      w."inventoryLocationWorkerId" AS id,
      COALESCE(NULLIF(MAX(w."workerDisplayName"), ''), MAX(lw.name), '—') AS name,
      COUNT(DISTINCT c."inventoryProductId")::int AS "productsCounted",
      COALESCE(SUM(w."countedQuantity"), 0)::float AS "unitsCounted",
      COUNT(*) FILTER (WHERE ABS(c."difference") > 0.0001)::int AS "diffCount",
      COUNT(*) FILTER (WHERE ABS(c."difference") > 0.0001)::int AS "errorCount",
      COUNT(*)::int AS total_lines,
      COUNT(*) FILTER (WHERE ABS(c."difference") < 0.0001)::int AS match_lines,
      COUNT(DISTINCT NULLIF(TRIM(w."workerWorkArea"), ''))::int AS "areaCount",
      ARRAY_REMOVE(ARRAY_AGG(DISTINCT NULLIF(TRIM(w."workerWorkArea"), '')), NULL) AS areas
    FROM "InventoryCountWorker" w
    INNER JOIN "InventoryCount" c ON c.id = w."inventoryCountId"
    LEFT JOIN "InventoryLocationWorker" lw ON lw.id = w."inventoryLocationWorkerId"
    WHERE ${clauses.join(" AND ")}
    GROUP BY w."inventoryLocationWorkerId"
    ORDER BY "unitsCounted" DESC
    LIMIT 50
  `;
  const rows = (await prismaAny.$queryRawUnsafe(sql, ...params)) as Array<{
    id: string;
    name: string;
    productsCounted: number;
    unitsCounted: number;
    diffCount: number;
    errorCount: number;
    total_lines: number;
    match_lines: number;
    areaCount: number;
    areas: string[] | null;
  }>;

  return rows.map((r) => {
    const total = Number(r.total_lines) || 0;
    const match = Number(r.match_lines) || 0;
    return {
      id: r.id,
      name: r.name,
      productsCounted: Number(r.productsCounted) || 0,
      unitsCounted: Number(r.unitsCounted) || 0,
      avgDurationMinutes: null,
      errorCount: Number(r.errorCount) || 0,
      diffCount: Number(r.diffCount) || 0,
      accuracyPct: total > 0 ? Math.round((match / total) * 1000) / 10 : 100,
      areaCount: Number(r.areaCount) || 0,
      areas: r.areas ?? [],
    };
  });
}

async function loadLocationStats(from: Date, to: Date, latest: LatestRow[]): Promise<LocationStat[]> {
  const locs = (await prismaAny.inventoryLocation.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  })) as { id: string; name: string }[];

  const [sessions, membership] = await Promise.all([
    prismaAny.$queryRawUnsafe(
      `
      SELECT
        s."locationId" AS id,
        MAX(s."createdAt") AS "lastCountedAt",
        (ARRAY_AGG(u."fullName" ORDER BY s."createdAt" DESC))[1] AS "lastCountedBy",
        AVG(EXTRACT(EPOCH FROM (s."createdAt" - s."countDate")) / 60.0)
          FILTER (WHERE s."createdAt" >= s."countDate"
            AND EXTRACT(EPOCH FROM (s."createdAt" - s."countDate")) BETWEEN 0 AND 86400)::float AS mins,
        COALESCE(SUM(s."matchCount"), 0)::float AS matches,
        COALESCE(SUM(s."shortageCount" + s."surplusCount" + s."matchCount"), 0)::float AS total
      FROM "InventoryCountSession" s
      LEFT JOIN "User" u ON u.id = s."countedByUserId"
      WHERE s."countDate" >= $1 AND s."countDate" <= $2 AND s."locationId" IS NOT NULL
      GROUP BY s."locationId"
    `,
      from,
      to,
    ) as Promise<
      Array<{
        id: string;
        lastCountedAt: Date | null;
        lastCountedBy: string | null;
        mins: number | null;
        matches: number;
        total: number;
      }>
    >,
    prismaAny.$queryRaw`
      SELECT loc.id AS "locationId", COUNT(DISTINCT p.id)::int AS cnt
      FROM "InventoryLocation" loc
      LEFT JOIN "InventoryProduct" p ON (
        p."locationId" = loc.id
        OR LOWER(TRIM(p."location")) = LOWER(TRIM(loc.name))
        OR EXISTS (
          SELECT 1 FROM "InventoryProductOnLocation" pl
          WHERE pl."locationId" = loc.id AND pl."inventoryProductId" = p.id
        )
      )
      WHERE loc."isActive" = true
      GROUP BY loc.id
    ` as Promise<{ locationId: string; cnt: number }[]>,
  ]);

  const sessMap = new Map(sessions.map((s) => [s.id, s]));
  const memMap = new Map(membership.map((m) => [m.locationId, Number(m.cnt)]));
  const byLoc = new Map<string, { short: number; sur: number }>();
  for (const row of latest) {
    if (!row.locationId) continue;
    const cur = byLoc.get(row.locationId) ?? { short: 0, sur: 0 };
    if (row.difference < -0.0001) cur.short += 1;
    else if (row.difference > 0.0001) cur.sur += 1;
    byLoc.set(row.locationId, cur);
  }

  return locs.map((loc) => {
    const s = sessMap.get(loc.id);
    const d = byLoc.get(loc.id) ?? { short: 0, sur: 0 };
    const total = Number(s?.total) || 0;
    const matches = Number(s?.matches) || 0;
    return {
      id: loc.id,
      name: loc.name,
      productCount: memMap.get(loc.id) ?? 0,
      shortageCount: d.short,
      surplusCount: d.sur,
      accuracyPct: total > 0 ? Math.round((matches / total) * 1000) / 10 : 100,
      avgDurationMinutes: s?.mins != null ? Math.round(Number(s.mins)) : null,
      lastCountedAt: s?.lastCountedAt ? new Date(s.lastCountedAt).toISOString() : null,
      lastCountedBy: s?.lastCountedBy ?? null,
    };
  });
}

function buildForecast(
  latest: LatestRow[],
  usageByProduct: Map<string, number>,
  windowDays: number,
): ForecastItem[] {
  const qtyByProduct = new Map<string, { name: string; qty: number }>();
  for (const r of latest) {
    const cur = qtyByProduct.get(r.inventoryProductId) ?? { name: r.productName, qty: 0 };
    cur.qty += Number(r.currentQuantity) || 0;
    qtyByProduct.set(r.inventoryProductId, cur);
  }
  const days = Math.max(1, windowDays);
  const out: ForecastItem[] = [];
  for (const [id, { name, qty }] of qtyByProduct) {
    const totalUsage = usageByProduct.get(id) ?? 0;
    const dailyUsage = totalUsage / days;
    const daysLeft = dailyUsage > 0.0001 ? qty / dailyUsage : null;
    const orderInDays = daysLeft == null ? null : Math.max(0, Math.floor(daysLeft - 3));
    out.push({
      id,
      name,
      currentQty: Math.round(qty * 100) / 100,
      dailyUsage: Math.round(dailyUsage * 100) / 100,
      daysLeft: daysLeft == null ? null : Math.round(daysLeft * 10) / 10,
      orderInDays,
      covers3d: daysLeft == null || daysLeft >= 3,
      covers7d: daysLeft == null || daysLeft >= 7,
      covers30d: daysLeft == null || daysLeft >= 30,
    });
  }
  return out
    .filter((f) => f.dailyUsage > 0)
    .sort((a, b) => (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999))
    .slice(0, 40);
}

function buildCritical(
  latest: LatestRow[],
  allProducts: { id: string; name: string; minimumQuantity: number }[],
  usageByProduct: Map<string, number>,
  windowDays: number,
  countedProductIds: Set<string>,
): CriticalBuckets {
  const qtyByProduct = new Map<string, { name: string; qty: number; min: number }>();
  for (const r of latest) {
    const cur = qtyByProduct.get(r.inventoryProductId) ?? {
      name: r.productName,
      qty: 0,
      min: r.minimumQuantity,
    };
    cur.qty += Number(r.currentQuantity) || 0;
    cur.min = Math.max(cur.min, r.minimumQuantity);
    qtyByProduct.set(r.inventoryProductId, cur);
  }

  const belowMinimum: NamedQty[] = [];
  const endsThisWeek: NamedQty[] = [];
  const anomalous: NamedQty[] = [];
  const noMovement: NamedQty[] = [];
  const neverCounted: NamedQty[] = [];

  const usages = [...usageByProduct.values()].filter((u) => u > 0);
  const avgUsage = usages.length ? usages.reduce((a, b) => a + b, 0) / usages.length : 0;

  for (const [id, v] of qtyByProduct) {
    if (v.min > 0 && v.qty < v.min) {
      belowMinimum.push({ id, name: v.name, quantity: v.qty, meta: `min ${v.min}` });
    }
    const daily = (usageByProduct.get(id) ?? 0) / Math.max(1, windowDays);
    if (daily > 0 && v.qty / daily <= 7) {
      endsThisWeek.push({
        id,
        name: v.name,
        quantity: v.qty,
        meta: `${Math.round((v.qty / daily) * 10) / 10}d`,
      });
    }
    const u = usageByProduct.get(id) ?? 0;
    if (avgUsage > 0 && u > avgUsage * 3) {
      anomalous.push({ id, name: v.name, quantity: u, meta: "x3+" });
    }
    if (u === 0) noMovement.push({ id, name: v.name, quantity: v.qty });
  }

  for (const p of allProducts) {
    if (!countedProductIds.has(p.id)) {
      neverCounted.push({ id: p.id, name: p.name, quantity: 0 });
    }
  }

  const sortQty = (a: NamedQty, b: NamedQty) => a.quantity - b.quantity;
  return {
    belowMinimum: belowMinimum.sort(sortQty).slice(0, 50),
    endsThisWeek: endsThisWeek.sort(sortQty).slice(0, 50),
    neverCounted: neverCounted.slice(0, 50),
    noMovement: noMovement.slice(0, 50),
    anomalous: anomalous.sort((a, b) => b.quantity - a.quantity).slice(0, 50),
  };
}

export async function getInventoryAnalyticsDashboard(input: {
  range?: string | null;
  from?: string | null;
  to?: string | null;
  locationId?: string | null;
  workerId?: string | null;
  category?: string | null;
  productId?: string | null;
}): Promise<AnalyticsDashboardDto> {
  const window = resolveAnalyticsWindow(input);
  const filters: FilterBits = {
    locationId: input.locationId?.trim() || undefined,
    workerId: input.workerId?.trim() || undefined,
    category: input.category?.trim() || undefined,
    productId: input.productId?.trim() || undefined,
  };
  const filterDto: AnalyticsFilters = {
    from: window.from.toISOString(),
    to: window.to.toISOString(),
    range: window.range,
    ...filters,
  };

  const windowDays = Math.max(
    1,
    Math.ceil((window.to.getTime() - window.from.getTime()) / (24 * 60 * 60 * 1000)),
  );
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [
    totalProducts,
    totalLocations,
    totalSessions,
    latest,
    usageDaily,
    usageWeekly,
    usageMonthly,
    usageYearly,
    productUsage,
    workers,
    heatmap,
    categories,
    locationsMeta,
    workersMeta,
    allProducts,
    avgSessionDuration,
    activeLocRows,
    accuracyRow,
  ] = await Promise.all([
    prismaAny.inventoryProduct.count(),
    prismaAny.inventoryLocation.count({ where: { isActive: true } }),
    prismaAny.inventoryCountSession.count({
      where: {
        countDate: { gte: window.from, lte: window.to },
        ...(filters.locationId ? { locationId: filters.locationId } : {}),
      },
    }),
    loadLatestCounts(filters),
    loadUsageSeries(window.from, window.to, "day", filters),
    loadUsageSeries(window.from, window.to, "week", filters),
    loadUsageSeries(window.from, window.to, "month", filters),
    loadUsageSeries(window.from, window.to, "year", filters),
    loadProductUsage(window.from, window.to, filters),
    loadWorkerStats(window.from, window.to, filters),
    loadHeatmap(window.from, window.to, filters),
    prismaAny.inventoryProduct.findMany({
      distinct: ["category"],
      select: { category: true },
      orderBy: { category: "asc" },
    }),
    prismaAny.inventoryLocation.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prismaAny.inventoryLocationWorker.findMany({
      where: {
        isActive: true,
        ...(filters.locationId ? { inventoryLocationId: filters.locationId } : {}),
      },
      select: { id: true, displayName: true },
      orderBy: { displayName: "asc" },
      take: 200,
    }),
    prismaAny.inventoryProduct.findMany({
      select: { id: true, name: true, nameHe: true, minimumQuantity: true },
    }),
    prismaAny.$queryRawUnsafe(
      `
      SELECT AVG(EXTRACT(EPOCH FROM (s."createdAt" - s."countDate")) / 60.0)::float AS mins
      FROM "InventoryCountSession" s
      WHERE s."countDate" >= $1 AND s."countDate" <= $2
        AND s."createdAt" >= s."countDate"
        AND EXTRACT(EPOCH FROM (s."createdAt" - s."countDate")) BETWEEN 0 AND 86400
    `,
      window.from,
      window.to,
    ) as Promise<{ mins: number | null }[]>,
    // מיקומים עם ספירה ב־7 ימים אחרונים = "פעילות"
    prismaAny.inventoryCountSession.findMany({
      where: {
        createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        locationId: { not: null },
      },
      distinct: ["locationId"],
      select: { locationId: true },
    }),
    prismaAny.$queryRawUnsafe(
      `
      SELECT
        COALESCE(SUM("matchCount"), 0)::float AS matches,
        COALESCE(SUM("shortageCount" + "surplusCount" + "matchCount"), 0)::float AS total
      FROM "InventoryCountSession"
      WHERE "countDate" >= $1 AND "countDate" <= $2
    `,
      window.from,
      window.to,
    ) as Promise<{ matches: number; total: number }[]>,
  ]);

  const locations = await loadLocationStats(window.from, window.to, latest);
  const usageByProduct = new Map(productUsage.map((p) => [p.id, p.quantity]));
  const countedIds = new Set(latest.map((r) => r.inventoryProductId));
  const productsNorm = (
    allProducts as Array<{
      id: string;
      name: string;
      nameHe: string | null;
      minimumQuantity: number;
    }>
  ).map((p) => ({
    id: p.id,
    name: p.nameHe?.trim() || p.name,
    minimumQuantity: p.minimumQuantity,
  }));

  let shortageProducts = 0;
  let surplusProducts = 0;
  let totalUnits = 0;
  const seenShort = new Set<string>();
  const seenSur = new Set<string>();
  const surplusList: NamedQty[] = [];
  for (const r of latest) {
    totalUnits += Number(r.currentQuantity) || 0;
    if (r.difference < -0.0001 && !seenShort.has(r.inventoryProductId)) {
      seenShort.add(r.inventoryProductId);
      shortageProducts += 1;
    }
    if (r.difference > 0.0001 && !seenSur.has(r.inventoryProductId)) {
      seenSur.add(r.inventoryProductId);
      surplusProducts += 1;
      surplusList.push({
        id: r.inventoryProductId,
        name: r.productName,
        quantity: r.difference,
      });
    }
  }

  const matches = Number(accuracyRow[0]?.matches) || 0;
  const accTotal = Number(accuracyRow[0]?.total) || 0;
  const avgAccuracyPct = accTotal > 0 ? Math.round((matches / accTotal) * 1000) / 10 : 100;

  const lastByProduct = new Map<string, Date>();
  for (const r of latest) {
    const prev = lastByProduct.get(r.inventoryProductId);
    if (!prev || r.countDate > prev) lastByProduct.set(r.inventoryProductId, r.countDate);
  }
  const uncountedOver30Days = productsNorm.filter((p) => {
    const last = lastByProduct.get(p.id);
    return !last || last < thirtyDaysAgo;
  }).length;

  const mostUsed = productUsage.slice(0, 20);
  const withUsage = productUsage.filter((p) => p.quantity > 0);
  const leastUsed = [...withUsage].sort((a, b) => a.quantity - b.quantity).slice(0, 20);
  const noMovement = productsNorm
    .filter((p) => !usageByProduct.has(p.id) || (usageByProduct.get(p.id) ?? 0) === 0)
    .slice(0, 20)
    .map((p) => ({ id: p.id, name: p.name, quantity: 0 }));

  const usages = withUsage.map((p) => p.quantity);
  const avgU = usages.length ? usages.reduce((a, b) => a + b, 0) / usages.length : 0;
  const anomalous = withUsage.filter((p) => avgU > 0 && p.quantity > avgU * 3).slice(0, 20);

  const nearMinimum: NamedQty[] = [];
  const qtyMap = new Map<string, number>();
  for (const r of latest) {
    qtyMap.set(r.inventoryProductId, (qtyMap.get(r.inventoryProductId) ?? 0) + Number(r.currentQuantity));
  }
  for (const p of productsNorm) {
    if (p.minimumQuantity <= 0) continue;
    const q = qtyMap.get(p.id) ?? 0;
    if (q > 0 && q <= p.minimumQuantity * 1.25) {
      nearMinimum.push({
        id: p.id,
        name: p.name,
        quantity: q,
        meta: `min ${p.minimumQuantity}`,
      });
    }
  }
  nearMinimum.sort((a, b) => a.quantity - b.quantity);

  const forecast = buildForecast(latest, usageByProduct, windowDays);
  const critical = buildCritical(latest, productsNorm, usageByProduct, windowDays, countedIds);

  const avgMins = Number(avgSessionDuration[0]?.mins);
  const activeCounts = (activeLocRows as { locationId: string | null }[]).length;

  // attach surplus list for drill via critical extension — store top in anomalous-like
  void surplusList;

  return {
    generatedAt: new Date().toISOString(),
    filters: filterDto,
    kpis: {
      totalProducts,
      totalLocations,
      totalCounts: totalSessions,
      activeCounts,
      avgAccuracyPct,
      shortageProducts,
      surplusProducts,
      totalUnits: Math.round(totalUnits * 100) / 100,
      uncountedOver30Days,
      avgCountDurationMinutes: Number.isFinite(avgMins) ? Math.round(avgMins) : null,
    },
    usage: {
      daily: usageDaily,
      weekly: usageWeekly,
      monthly: usageMonthly,
      yearly: usageYearly,
    },
    topProducts: {
      mostUsed,
      leastUsed,
      noMovement,
      anomalous,
      nearMinimum: nearMinimum.slice(0, 20),
    },
    workers,
    locations: filters.locationId
      ? locations.filter((l) => l.id === filters.locationId)
      : locations,
    forecast,
    critical,
    heatmap,
    meta: {
      categories: (categories as { category: string }[]).map((c) => c.category).filter(Boolean),
      locations: locationsMeta as { id: string; name: string }[],
      workers: (workersMeta as { id: string; displayName: string }[]).map((w) => ({
        id: w.id,
        name: w.displayName,
      })),
      unsupportedFilters: ["supplier", "brand"],
    },
  };
}

export async function getAnalyticsDrill(
  type: AnalyticsDrillType,
  input: {
    range?: string | null;
    from?: string | null;
    to?: string | null;
    locationId?: string | null;
    category?: string | null;
  },
): Promise<AnalyticsDrillRow[]> {
  const dash = await getInventoryAnalyticsDashboard(input);
  switch (type) {
    case "shortages":
    case "belowMinimum":
      return dash.critical.belowMinimum.map((x) => ({
        id: x.id,
        title: x.name,
        value: x.quantity,
        meta: x.meta,
      }));
    case "surpluses":
      return dash.locations
        .filter((l) => l.surplusCount > 0)
        .map((l) => ({
          id: l.id,
          title: l.name,
          value: l.surplusCount,
          meta: "surplus lines",
        }));
    case "uncounted":
      return dash.critical.neverCounted.map((x) => ({
        id: x.id,
        title: x.name,
        value: 0,
      }));
    case "noMovement":
      return dash.critical.noMovement.map((x) => ({
        id: x.id,
        title: x.name,
        value: x.quantity,
      }));
    case "activeLocations":
      return dash.locations
        .filter((l) => l.lastCountedAt)
        .map((l) => ({
          id: l.id,
          title: l.name,
          subtitle: l.lastCountedBy ?? undefined,
          value: l.productCount,
          meta: l.lastCountedAt ?? undefined,
        }));
    case "counts":
      return (
        (await prismaAny.inventoryCountSession.findMany({
          where: {
            countDate: { gte: new Date(dash.filters.from), lte: new Date(dash.filters.to) },
            ...(input.locationId ? { locationId: input.locationId } : {}),
          },
          orderBy: { createdAt: "desc" },
          take: 100,
          select: {
            id: true,
            sessionNumber: true,
            locationName: true,
            productCount: true,
            createdAt: true,
          },
        })) as Array<{
          id: string;
          sessionNumber: number;
          locationName: string;
          productCount: number;
          createdAt: Date;
        }>
      ).map((s) => ({
        id: s.id,
        title: `#${s.sessionNumber} · ${s.locationName || "—"}`,
        value: s.productCount,
        meta: s.createdAt.toISOString(),
      }));
    case "workers":
      return dash.workers.map((w) => ({
        id: w.id,
        title: w.name,
        value: w.unitsCounted,
        meta: `${w.accuracyPct}%`,
      }));
    case "locations":
      return dash.locations.map((l) => ({
        id: l.id,
        title: l.name,
        value: l.productCount,
        meta: `${l.accuracyPct}%`,
      }));
    default:
      return [];
  }
}
