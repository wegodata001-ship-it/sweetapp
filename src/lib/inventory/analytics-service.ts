import { prismaAny } from "@/lib/prisma";
import type {
  AnalyticsDashboardDto,
  AnalyticsDrillTable,
  AnalyticsDrillType,
  AnalyticsFilters,
  AnalyticsRange,
  CriticalBuckets,
  ForecastItem,
  HeatCell,
  LocationStat,
  NamedQty,
  ProductFocusDto,
  ProductSearchHit,
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

export async function searchAnalyticsProducts(q: string, limit = 20): Promise<ProductSearchHit[]> {
  const term = q.trim();
  if (term.length < 1) return [];
  const rows = (await prismaAny.inventoryProduct.findMany({
    where: {
      OR: [
        { name: { contains: term, mode: "insensitive" } },
        { nameHe: { contains: term, mode: "insensitive" } },
        { nameAr: { contains: term, mode: "insensitive" } },
        { nameEn: { contains: term, mode: "insensitive" } },
        { barcode: { contains: term, mode: "insensitive" } },
        { sku: { contains: term, mode: "insensitive" } },
      ],
    },
    take: Math.min(40, Math.max(5, limit)),
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      nameHe: true,
      nameAr: true,
      nameEn: true,
      barcode: true,
      sku: true,
    },
  })) as ProductSearchHit[];
  return rows.map((r) => ({
    ...r,
    name: r.nameHe?.trim() || r.name,
  }));
}

async function loadProductFocus(
  productId: string,
  from: Date,
  to: Date,
  windowDays: number,
): Promise<ProductFocusDto | null> {
  const product = (await prismaAny.inventoryProduct.findUnique({
    where: { id: productId },
    select: {
      id: true,
      name: true,
      nameHe: true,
      nameAr: true,
      nameEn: true,
      barcode: true,
      sku: true,
      locationId: true,
      location: true,
      inventoryLocation: { select: { id: true, name: true } },
      placements: { select: { locationId: true, location: { select: { id: true, name: true } } } },
    },
  })) as {
    id: string;
    name: string;
    nameHe: string | null;
    nameAr: string | null;
    nameEn: string | null;
    barcode: string | null;
    sku: string | null;
    locationId: string | null;
    location: string;
    inventoryLocation: { id: string; name: string } | null;
    placements: { locationId: string; location: { id: string; name: string } }[];
  } | null;
  if (!product) return null;

  const [usageRow, lastUsageRow, countsPerformed, latestLocs] = await Promise.all([
    prismaAny.$queryRawUnsafe(
      `
      SELECT COALESCE(SUM(-c."difference"), 0)::float AS usage
      FROM "InventoryCount" c
      WHERE c."inventoryProductId" = $1
        AND c."countDate" >= $2 AND c."countDate" <= $3
        AND c."difference" < 0
    `,
      productId,
      from,
      to,
    ) as Promise<{ usage: number }[]>,
    prismaAny.$queryRawUnsafe(
      `
      SELECT MAX(c."countDate") AS last
      FROM "InventoryCount" c
      WHERE c."inventoryProductId" = $1 AND c."difference" < 0
    `,
      productId,
    ) as Promise<{ last: Date | null }[]>,
    prismaAny.inventoryCount.count({ where: { inventoryProductId: productId } }),
    prismaAny.$queryRawUnsafe(
      `
      SELECT DISTINCT ON (c."locationId")
        c."locationId",
        COALESCE(l.name, '') AS "locationName",
        c."currentQuantity"::float AS qty
      FROM "InventoryCount" c
      LEFT JOIN "InventoryLocation" l ON l.id = c."locationId"
      WHERE c."inventoryProductId" = $1
      ORDER BY c."locationId", c."countDate" DESC
    `,
      productId,
    ) as Promise<{ locationId: string | null; locationName: string; qty: number }[]>,
  ]);

  const usage = Number(usageRow[0]?.usage) || 0;
  const days = Math.max(1, windowDays);
  const avgDaily = usage / days;
  const qtyByLoc = new Map<string, { id: string | null; name: string; qty: number }>();
  for (const r of latestLocs) {
    const key = r.locationId ?? "__none__";
    qtyByLoc.set(key, {
      id: r.locationId,
      name: r.locationName || product.inventoryLocation?.name || product.location || "—",
      qty: Number(r.qty) || 0,
    });
  }
  // הוספת placements בלי ספירה עדיין
  for (const pl of product.placements) {
    if (!qtyByLoc.has(pl.locationId)) {
      qtyByLoc.set(pl.locationId, { id: pl.location.id, name: pl.location.name, qty: 0 });
    }
  }
  if (product.locationId && !qtyByLoc.has(product.locationId)) {
    qtyByLoc.set(product.locationId, {
      id: product.locationId,
      name: product.inventoryLocation?.name || product.location || "—",
      qty: 0,
    });
  }

  const currentQty = [...qtyByLoc.values()].reduce((s, x) => s + x.qty, 0);
  const daysLeft = avgDaily > 0.0001 ? currentQty / avgDaily : null;
  const last = lastUsageRow[0]?.last;

  return {
    id: product.id,
    name: product.nameHe?.trim() || product.name,
    nameHe: product.nameHe,
    nameAr: product.nameAr,
    nameEn: product.nameEn,
    barcode: product.barcode,
    sku: product.sku,
    currentQty: Math.round(currentQty * 100) / 100,
    avgDaily: Math.round(avgDaily * 100) / 100,
    avgWeekly: Math.round(avgDaily * 7 * 100) / 100,
    avgMonthly: Math.round(avgDaily * 30 * 100) / 100,
    avgYearly: Math.round(avgDaily * 365 * 100) / 100,
    daysLeft: daysLeft == null ? null : Math.round(daysLeft * 10) / 10,
    lastUsageAt: last ? new Date(last).toISOString() : null,
    countsPerformed,
    locations: [...qtyByLoc.values()],
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
  void surplusList;

  const productFocus = filters.productId
    ? await loadProductFocus(filters.productId, window.from, window.to, windowDays)
    : null;

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
    productFocus,
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

export async function getAnalyticsDrillTable(
  type: AnalyticsDrillType,
  input: {
    range?: string | null;
    from?: string | null;
    to?: string | null;
    locationId?: string | null;
    category?: string | null;
    productId?: string | null;
    day?: string | null;
  },
): Promise<AnalyticsDrillTable> {
  const window = resolveAnalyticsWindow(input);
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const windowDays = Math.max(
    1,
    Math.ceil((window.to.getTime() - window.from.getTime()) / (24 * 60 * 60 * 1000)),
  );

  if (type === "dayUsage") {
    const dayStr = input.day?.trim();
    if (!dayStr) {
      return { type, columns: [{ key: "info", label: "info" }], rows: [] };
    }
    const dayStart = new Date(`${dayStr}T00:00:00`);
    const dayEnd = new Date(`${dayStr}T23:59:59.999`);
    const params: unknown[] = [dayStart, dayEnd];
    let productClause = "";
    if (input.productId?.trim()) {
      params.push(input.productId.trim());
      productClause = `AND c."inventoryProductId" = $${params.length}`;
    }
    const rows = (await prismaAny.$queryRawUnsafe(
      `
      SELECT
        c.id,
        COALESCE(NULLIF(p."nameHe", ''), p."name") AS product,
        COALESCE(l.name, '') AS location,
        c."previousQuantity"::float AS previous,
        c."currentQuantity"::float AS current,
        c."difference"::float AS difference,
        c."countDate"
      FROM "InventoryCount" c
      INNER JOIN "InventoryProduct" p ON p.id = c."inventoryProductId"
      LEFT JOIN "InventoryLocation" l ON l.id = c."locationId"
      WHERE c."countDate" >= $1 AND c."countDate" <= $2
        ${productClause}
      ORDER BY c."countDate" DESC
      LIMIT 200
    `,
      ...params,
    )) as Array<{
      id: string;
      product: string;
      location: string;
      previous: number;
      current: number;
      difference: number;
      countDate: Date;
    }>;
    return {
      type,
      columns: [
        { key: "product", label: "product" },
        { key: "location", label: "location" },
        { key: "previous", label: "previous" },
        { key: "current", label: "current" },
        { key: "difference", label: "difference" },
        { key: "time", label: "time" },
      ],
      rows: rows.map((r) => ({
        id: r.id,
        product: r.product,
        location: r.location || "—",
        previous: Number(r.previous),
        current: Number(r.current),
        difference: Number(r.difference),
        time: new Date(r.countDate).toLocaleString(),
      })),
    };
  }

  if (type === "shortages" || type === "belowMinimum") {
    const rows = (await prismaAny.$queryRawUnsafe(
      `
      WITH latest AS (
        SELECT DISTINCT ON (c."inventoryProductId", c."locationId")
          c."inventoryProductId",
          c."locationId",
          c."currentQuantity"::float AS qty
        FROM "InventoryCount" c
        ORDER BY c."inventoryProductId", c."locationId", c."countDate" DESC
      ),
      by_product AS (
        SELECT
          latest."inventoryProductId" AS id,
          COALESCE(SUM(latest.qty), 0)::float AS on_hand,
          (ARRAY_AGG(COALESCE(l.name, '—') ORDER BY latest.qty DESC))[1] AS location
        FROM latest
        LEFT JOIN "InventoryLocation" l ON l.id = latest."locationId"
        GROUP BY latest."inventoryProductId"
      )
      SELECT
        p.id,
        COALESCE(NULLIF(p."nameHe", ''), p."name") AS product,
        COALESCE(bp.location, p."location", '—') AS location,
        COALESCE(bp.on_hand, 0)::float AS on_hand,
        p."minimumQuantity"::float AS minimum
      FROM "InventoryProduct" p
      LEFT JOIN by_product bp ON bp.id = p.id
      WHERE p."minimumQuantity" > 0
        AND COALESCE(bp.on_hand, 0) < p."minimumQuantity"
      ORDER BY (p."minimumQuantity" - COALESCE(bp.on_hand, 0)) DESC
      LIMIT 100
    `,
    )) as Array<{
      id: string;
      product: string;
      location: string;
      on_hand: number;
      minimum: number;
    }>;
    return {
      type,
      columns: [
        { key: "product", label: "product" },
        { key: "location", label: "location" },
        { key: "onHand", label: "onHand" },
        { key: "minimum", label: "minimum" },
        { key: "missing", label: "missing" },
      ],
      rows: rows.map((r) => ({
        id: r.id,
        product: r.product,
        location: r.location,
        onHand: Number(r.on_hand),
        minimum: Number(r.minimum),
        missing: Math.max(0, Number(r.minimum) - Number(r.on_hand)),
      })),
    };
  }

  if (type === "surpluses") {
    const rows = (await prismaAny.$queryRawUnsafe(
      `
      SELECT DISTINCT ON (c."inventoryProductId", c."locationId")
        c.id,
        COALESCE(NULLIF(p."nameHe", ''), p."name") AS product,
        COALESCE(l.name, '—') AS location,
        c."difference"::float AS surplus
      FROM "InventoryCount" c
      INNER JOIN "InventoryProduct" p ON p.id = c."inventoryProductId"
      LEFT JOIN "InventoryLocation" l ON l.id = c."locationId"
      WHERE c."difference" > 0.0001
      ORDER BY c."inventoryProductId", c."locationId", c."countDate" DESC
      LIMIT 100
    `,
    )) as Array<{ id: string; product: string; location: string; surplus: number }>;
    return {
      type,
      columns: [
        { key: "product", label: "product" },
        { key: "location", label: "location" },
        { key: "surplus", label: "surplus" },
      ],
      rows: rows.map((r) => ({
        id: r.id,
        product: r.product,
        location: r.location,
        surplus: Number(r.surplus),
      })),
    };
  }

  if (type === "uncounted") {
    const rows = (await prismaAny.$queryRawUnsafe(
      `
      SELECT
        p.id,
        COALESCE(NULLIF(p."nameHe", ''), p."name") AS product,
        MAX(c."countDate") AS last_count
      FROM "InventoryProduct" p
      LEFT JOIN "InventoryCount" c ON c."inventoryProductId" = p.id
      GROUP BY p.id, product
      HAVING MAX(c."countDate") IS NULL OR MAX(c."countDate") < $1
      ORDER BY MAX(c."countDate") ASC NULLS FIRST
      LIMIT 100
    `,
      thirtyDaysAgo,
    )) as Array<{ id: string; product: string; last_count: Date | null }>;
    const now = Date.now();
    return {
      type,
      columns: [
        { key: "product", label: "product" },
        { key: "daysWithout", label: "daysWithout" },
      ],
      rows: rows.map((r) => ({
        id: r.id,
        product: r.product,
        daysWithout: r.last_count
          ? Math.floor((now - new Date(r.last_count).getTime()) / (24 * 60 * 60 * 1000))
          : null,
      })),
    };
  }

  if (type === "highUsage" || type === "noMovement") {
    const usage = (await prismaAny.$queryRawUnsafe(
      `
      SELECT
        p.id,
        COALESCE(NULLIF(p."nameHe", ''), p."name") AS product,
        COALESCE(SUM(CASE WHEN c."difference" < 0 THEN -c."difference" ELSE 0 END), 0)::float AS usage
      FROM "InventoryProduct" p
      LEFT JOIN "InventoryCount" c
        ON c."inventoryProductId" = p.id
       AND c."countDate" >= $1 AND c."countDate" <= $2
      GROUP BY p.id, product
      ORDER BY usage DESC
      LIMIT 200
    `,
      window.from,
      window.to,
    )) as Array<{ id: string; product: string; usage: number }>;
    const days = Math.max(1, windowDays);
    if (type === "noMovement") {
      return {
        type,
        columns: [
          { key: "product", label: "product" },
          { key: "avgDaily", label: "avgDaily" },
        ],
        rows: usage
          .filter((u) => Number(u.usage) === 0)
          .slice(0, 100)
          .map((u) => ({
            id: u.id,
            product: u.product,
            avgDaily: 0,
          })),
      };
    }
    const positive = usage.filter((u) => Number(u.usage) > 0);
    const avg = positive.length
      ? positive.reduce((s, u) => s + Number(u.usage), 0) / positive.length
      : 0;
    return {
      type,
      columns: [
        { key: "product", label: "product" },
        { key: "avgDaily", label: "avgDaily" },
        { key: "avgWeekly", label: "avgWeekly" },
        { key: "avgMonthly", label: "avgMonthly" },
      ],
      rows: positive
        .filter((u) => avg === 0 || Number(u.usage) >= avg)
        .slice(0, 50)
        .map((u) => {
          const daily = Number(u.usage) / days;
          return {
            id: u.id,
            product: u.product,
            avgDaily: Math.round(daily * 100) / 100,
            avgWeekly: Math.round(daily * 7 * 100) / 100,
            avgMonthly: Math.round(daily * 30 * 100) / 100,
          };
        }),
    };
  }

  if (type === "counts") {
    const sessions = (await prismaAny.inventoryCountSession.findMany({
      where: {
        countDate: { gte: window.from, lte: window.to },
        ...(input.locationId ? { locationId: input.locationId } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        sessionNumber: true,
        locationName: true,
        productCount: true,
        shortageCount: true,
        surplusCount: true,
        createdAt: true,
      },
    })) as Array<{
      id: string;
      sessionNumber: number;
      locationName: string;
      productCount: number;
      shortageCount: number;
      surplusCount: number;
      createdAt: Date;
    }>;
    return {
      type,
      columns: [
        { key: "session", label: "session" },
        { key: "location", label: "location" },
        { key: "products", label: "products" },
        { key: "shortage", label: "shortage" },
        { key: "surplus", label: "surplus" },
        { key: "when", label: "when" },
      ],
      rows: sessions.map((s) => ({
        id: s.id,
        session: `#${s.sessionNumber}`,
        location: s.locationName || "—",
        products: s.productCount,
        shortage: s.shortageCount,
        surplus: s.surplusCount,
        when: s.createdAt.toISOString(),
      })),
    };
  }

  if (type === "locations" || type === "activeLocations") {
    const dash = await getInventoryAnalyticsDashboard(input);
    const list =
      type === "activeLocations"
        ? dash.locations.filter((l) => l.lastCountedAt)
        : dash.locations;
    return {
      type,
      columns: [
        { key: "location", label: "location" },
        { key: "products", label: "products" },
        { key: "shortage", label: "shortage" },
        { key: "surplus", label: "surplus" },
        { key: "accuracy", label: "accuracy" },
        { key: "last", label: "last" },
      ],
      rows: list.map((l) => ({
        id: l.id,
        location: l.name,
        products: l.productCount,
        shortage: l.shortageCount,
        surplus: l.surplusCount,
        accuracy: `${l.accuracyPct}%`,
        last: l.lastCountedAt,
      })),
    };
  }

  if (type === "workers") {
    const dash = await getInventoryAnalyticsDashboard(input);
    return {
      type,
      columns: [
        { key: "worker", label: "worker" },
        { key: "products", label: "products" },
        { key: "units", label: "units" },
        { key: "accuracy", label: "accuracy" },
        { key: "areas", label: "areas" },
      ],
      rows: dash.workers.map((w) => ({
        id: w.id,
        worker: w.name,
        products: w.productsCounted,
        units: w.unitsCounted,
        accuracy: `${w.accuracyPct}%`,
        areas: w.areaCount,
      })),
    };
  }

  return { type, columns: [], rows: [] };
}

/** תאימות לאחור */
export async function getAnalyticsDrill(
  type: AnalyticsDrillType,
  input: Parameters<typeof getAnalyticsDrillTable>[1],
) {
  const table = await getAnalyticsDrillTable(type, input);
  return table.rows.map((r, i) => ({
    id: String(r.id ?? i),
    title: String(r.product ?? r.location ?? r.worker ?? r.session ?? r.id ?? ""),
    subtitle: r.location != null ? String(r.location) : undefined,
    value: typeof r.missing === "number" ? r.missing : typeof r.surplus === "number" ? r.surplus : undefined,
    meta: r.when != null ? String(r.when) : undefined,
  }));
}
