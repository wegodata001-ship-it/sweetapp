import { prismaAny } from "@/lib/prisma";
import {
  serializeWorker,
  WORKER_SELECT,
  type LocationWorkerRow,
} from "@/lib/inventory/location-workers";
import {
  LATEST_COUNT_ORDER_BY,
  LOCATION_ORDER_BY,
  pickLatestCountForLocation,
} from "@/lib/inventory/count-latest";
import { ACTIVE_COUNT_LINE_WHERE } from "@/lib/inventory/count-session-status";
import {
  ensureLocationSchemaColumns,
  isMissingColumnError,
} from "@/lib/inventory/ensure-location-schema";

export type ResolvedShelf = {
  id: string | null;
  name: string;
};

export type ResolvedShelfWithWorkers = ResolvedShelf & {
  workers: LocationWorkerRow[];
};

export async function resolveShelf(shelfId: string | null, shelfName?: string): Promise<ResolvedShelf | null> {
  const id = shelfId?.trim();
  if (id) {
    const loc = await prismaAny.inventoryLocation.findFirst({
      where: { id, isActive: true },
      select: { id: true, name: true },
    });
    if (loc) return { id: loc.id, name: loc.name };
  }
  const name = shelfName?.trim();
  if (!name) return null;
  const loc = await prismaAny.inventoryLocation.findFirst({
    where: { name: { equals: name, mode: "insensitive" }, isActive: true },
    select: { id: true, name: true },
  });
  if (loc) return { id: loc.id, name: loc.name };
  return { id: null, name };
}

/** Location + active workers in one DB round-trip (count screen). */
export async function resolveShelfWithWorkers(
  shelfId: string | null,
  shelfName?: string,
): Promise<ResolvedShelfWithWorkers | null> {
  const id = shelfId?.trim();
  const name = shelfName?.trim();
  const loc = id
    ? await prismaAny.inventoryLocation.findFirst({
        where: { id, isActive: true },
        select: {
          id: true,
          name: true,
          workers: {
            where: { isActive: true },
            orderBy: { displayOrder: "asc" },
            select: WORKER_SELECT,
          },
        },
      })
    : name
      ? await prismaAny.inventoryLocation.findFirst({
          where: { name: { equals: name, mode: "insensitive" }, isActive: true },
          select: {
            id: true,
            name: true,
            workers: {
              where: { isActive: true },
              orderBy: { displayOrder: "asc" },
              select: WORKER_SELECT,
            },
          },
        })
      : null;

  if (loc) {
    return {
      id: loc.id,
      name: loc.name,
      workers: (loc.workers ?? []).map(serializeWorker),
    };
  }
  if (name) return { id: null, name, workers: [] };
  return null;
}

/**
 * מוצרים על מדף — Source of Truth = placements (N:M).
 * legacy (locationId / טקסט) רק למוצרים שעדיין אין להם אף placement,
 * כדי שלא ידלוף מוצר ממחסן אחר בגלל טקסט/primary ישן.
 */
export function productsOnShelfWhere(shelf: ResolvedShelf) {
  if (shelf.id) {
    return {
      OR: [
        { placements: { some: { locationId: shelf.id } } },
        {
          AND: [{ locationId: shelf.id }, { placements: { none: {} } }],
        },
        {
          AND: [
            { location: { equals: shelf.name, mode: "insensitive" as const } },
            { locationId: null },
            { placements: { none: {} } },
          ],
        },
      ],
    };
  }
  return {
    OR: [
      {
        AND: [
          { location: { equals: shelf.name, mode: "insensitive" as const } },
          { placements: { none: {} } },
        ],
      },
      {
        placements: {
          some: { location: { name: { equals: shelf.name, mode: "insensitive" as const } } },
        },
      },
    ],
  };
}

export async function ensureProductOnShelf(
  tx: typeof prismaAny,
  productId: string,
  locationId: string,
  opts?: { seedMinimumFromProduct?: boolean },
): Promise<void> {
  const maxOrder = await tx.inventoryProductOnLocation.aggregate({
    where: { locationId },
    _max: { displayOrder: true },
  });
  const nextOrder = Number(maxOrder._max?.displayOrder ?? 0) + 1;
  let seedMin = 0;
  if (opts?.seedMinimumFromProduct !== false) {
    const product = await tx.inventoryProduct.findUnique({
      where: { id: productId },
      select: { minimumQuantity: true },
    });
    seedMin = Math.max(0, Number(product?.minimumQuantity ?? 0) || 0);
  }
  await tx.inventoryProductOnLocation.upsert({
    where: {
      inventoryProductId_locationId: {
        inventoryProductId: productId,
        locationId,
      },
    },
    create: {
      inventoryProductId: productId,
      locationId,
      displayOrder: nextOrder,
      minimumQuantity: seedMin,
    },
    update: {},
  });
}

/**
 * עדכון מינימום למוצר בתוך מקום אחסון בלבד.
 * לא נוגע ב־InventoryCount / כמות מלאי / מיקומים אחרים.
 */
export async function setProductMinimumOnShelf(
  tx: typeof prismaAny,
  productId: string,
  locationId: string,
  minimumQuantity: number,
): Promise<{ minimumQuantity: number }> {
  const min = Math.max(0, Number(minimumQuantity) || 0);
  await ensureProductOnShelf(tx, productId, locationId, { seedMinimumFromProduct: false });
  await tx.inventoryProductOnLocation.update({
    where: {
      inventoryProductId_locationId: {
        inventoryProductId: productId,
        locationId,
      },
    },
    data: { minimumQuantity: min },
  });
  return { minimumQuantity: min };
}

/**
 * הסרת מוצר ממקום אחסון — מוחק רק שיוך N:M / מנקה primary ישן.
 * לא מוחק Product, לא מוחק InventoryCount / היסטוריה.
 */
export async function removeProductFromShelf(
  tx: typeof prismaAny,
  productId: string,
  locationId: string,
): Promise<{ removed: boolean }> {
  const existing = await tx.inventoryProductOnLocation.findUnique({
    where: {
      inventoryProductId_locationId: {
        inventoryProductId: productId,
        locationId,
      },
    },
    select: { id: true },
  });
  if (existing) {
    await tx.inventoryProductOnLocation.delete({ where: { id: existing.id } });
  }

  const product = await tx.inventoryProduct.findUnique({
    where: { id: productId },
    select: {
      locationId: true,
      placements: {
        select: { locationId: true, location: { select: { name: true } } },
        orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
        take: 1,
      },
    },
  });
  if (!product) return { removed: Boolean(existing) };

  const wasPrimary = product.locationId === locationId;
  if (wasPrimary) {
    const next = product.placements[0] ?? null;
    await tx.inventoryProduct.update({
      where: { id: productId },
      data: {
        locationId: next?.locationId ?? null,
        location: next?.location?.name ?? "",
      },
    });
  }

  return { removed: Boolean(existing) || wasPrimary };
}

/** מזהי מוצרים על מדף בסדר התצוגה של המקום (placement.displayOrder) */
export async function orderedProductIdsOnShelf(shelf: ResolvedShelf): Promise<string[]> {
  if (shelf.id) {
    const placements = (await prismaAny.inventoryProductOnLocation.findMany({
      where: { locationId: shelf.id },
      orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
      select: { inventoryProductId: true },
    })) as { inventoryProductId: string }[];
    const ordered = placements.map((p) => p.inventoryProductId);
    const placed = new Set(ordered);
    const legacy = (await prismaAny.inventoryProduct.findMany({
      where: {
        AND: [productsOnShelfWhere(shelf), { id: { notIn: [...placed] } }],
      },
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
      select: { id: true },
    })) as { id: string }[];
    return [...ordered, ...legacy.map((p) => p.id)];
  }
  const rows = (await prismaAny.inventoryProduct.findMany({
    where: productsOnShelfWhere(shelf),
    orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
    select: { id: true },
  })) as { id: string }[];
  return rows.map((r) => r.id);
}

export async function uniqueShelfCopyName(baseName: string): Promise<string> {
  const suffix = " (עותק)";
  let candidate = `${baseName}${suffix}`;
  let n = 2;
  while (
    await prismaAny.inventoryLocation.findFirst({
      where: { name: { equals: candidate, mode: "insensitive" } },
      select: { id: true },
    })
  ) {
    candidate = `${baseName}${suffix} ${n}`;
    n += 1;
  }
  return candidate;
}

export type ShelfSummaryStats = {
  name: string;
  locationId: string | null;
  code: string | null;
  description: string | null;
  locationType: string;
  targetProductCount: number | null;
  color: string | null;
  isActive: boolean;
  createdAt: string | null;
  displayOrder: number;
  productCount: number;
  shortageCount: number;
  surplusCount: number;
  okCount: number;
  matchPct: number;
  countedProductCount: number;
  lastCountAt: string | null;
  lastCountedByName: string | null;
  countStatus: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
};

type CountDiffRow = {
  inventoryProductId: string;
  locationId: string | null;
  difference: number;
  countDate: Date;
  countedBy: { fullName: string } | null;
};

function toShelfSummaryStats(
  seed: {
    name: string;
    locationId: string | null;
    code: string | null;
    description: string | null;
    locationType: string;
    targetProductCount: number | null;
    color: string | null;
    isActive: boolean;
    createdAt: string | null;
    displayOrder?: number;
  },
  productIds: string[],
  countsByProduct: Map<string, CountDiffRow[]>,
): ShelfSummaryStats {
  let shortageCount = 0;
  let surplusCount = 0;
  let okCount = 0;
  let countedProductCount = 0;
  let lastCountAt: Date | null = null;
  let lastCountedByName: string | null = null;

  for (const pid of productIds) {
    const latest = pickLatestCountForLocation(
      countsByProduct.get(pid) ?? [],
      seed.locationId,
    );
    if (!latest) continue;
    countedProductCount += 1;
    if (latest.difference < 0) shortageCount += 1;
    else if (latest.difference > 0) surplusCount += 1;
    else okCount += 1;
    if (!lastCountAt || latest.countDate > lastCountAt) {
      lastCountAt = latest.countDate;
      lastCountedByName = latest.countedBy?.fullName ?? null;
    }
  }

  const productCount = productIds.length;
  return {
    ...seed,
    displayOrder: seed.displayOrder ?? 0,
    productCount,
    shortageCount,
    surplusCount,
    okCount,
    matchPct: productCount > 0 ? Math.round((okCount / productCount) * 100) : 100,
    countedProductCount,
    lastCountAt: lastCountAt ? lastCountAt.toISOString() : null,
    lastCountedByName,
    countStatus:
      productCount > 0 && countedProductCount >= productCount
        ? "COMPLETED"
        : countedProductCount > 0
          ? "IN_PROGRESS"
          : "NOT_STARTED",
  };
}

const LOCATION_SUMMARY_SELECT = {
  id: true,
  name: true,
  code: true,
  description: true,
  locationType: true,
  targetProductCount: true,
  color: true,
  isActive: true,
  createdAt: true,
  displayOrder: true,
} as const;

const LOCATION_SUMMARY_SELECT_LEGACY = {
  id: true,
  name: true,
  code: true,
  description: true,
  locationType: true,
  targetProductCount: true,
  color: true,
  isActive: true,
  createdAt: true,
} as const;

/** טעינת מיקומים — עם fallback אם עמודת displayOrder עדיין לא קיימת ב־DB */
async function loadLocationsForSummaries() {
  await ensureLocationSchemaColumns();
  try {
    return await prismaAny.inventoryLocation.findMany({
      orderBy: LOCATION_ORDER_BY,
      select: LOCATION_SUMMARY_SELECT,
    });
  } catch (e) {
    if (!isMissingColumnError(e)) throw e;
    const rows = await prismaAny.inventoryLocation.findMany({
      orderBy: { name: "asc" },
      select: LOCATION_SUMMARY_SELECT_LEGACY,
    });
    return rows.map((r: Record<string, unknown>) => ({ ...r, displayOrder: 0 }));
  }
}

function parseJsonArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

async function loadShelfSummarySnapshot(): Promise<
  [
    Array<{
      id: string;
      name: string;
      code: string | null;
      description: string | null;
      locationType: string;
      targetProductCount: number | null;
      color: string | null;
      isActive: boolean;
      createdAt: Date;
      displayOrder: number;
    }>,
    Array<{ id: string; location: string; locationId: string | null; _count: { placements: number } }>,
    Array<{ inventoryProductId: string; locationId: string }>,
    CountDiffRow[],
  ]
> {
  await ensureLocationSchemaColumns();
  const rows = await prismaAny.$queryRaw<
    Array<{ locations: unknown; products: unknown; placements: unknown; latest_counts: unknown }>
  >`
    SELECT
      (SELECT coalesce(json_agg(x ORDER BY x."displayOrder", x.name), '[]'::json) FROM (
        SELECT id, name, code, description, "locationType", "targetProductCount", color, "isActive", "createdAt", "displayOrder"
        FROM "InventoryLocation"
      ) x) AS locations,
      (SELECT coalesce(json_agg(x), '[]'::json) FROM (
        SELECT p.id, p.location, p."locationId",
          (SELECT count(*)::int FROM "InventoryProductOnLocation" pl WHERE pl."inventoryProductId" = p.id) AS placement_count
        FROM "InventoryProduct" p
        WHERE p."locationId" IS NOT NULL
          OR p.location IS NULL
          OR p.location <> ''
          OR EXISTS (SELECT 1 FROM "InventoryProductOnLocation" pl WHERE pl."inventoryProductId" = p.id)
      ) x) AS products,
      (SELECT coalesce(json_agg(json_build_object(
          'inventoryProductId', pl."inventoryProductId",
          'locationId', pl."locationId"
        )), '[]'::json)
        FROM "InventoryProductOnLocation" pl) AS placements,
      (SELECT coalesce(json_agg(json_build_object(
          'inventoryProductId', c."inventoryProductId",
          'locationId', c."locationId",
          'difference', c.difference,
          'countDate', c."countDate",
          'countedByName', u."fullName"
        )), '[]'::json)
        FROM (
          SELECT DISTINCT ON (c."inventoryProductId", c."locationId")
            c."inventoryProductId", c."locationId", c.difference, c."countDate", c."countedByUserId"
          FROM "InventoryCount" c
          LEFT JOIN "InventoryCountSession" s ON s.id = c."sessionId"
          WHERE c."sessionId" IS NULL OR s.status <> 'VOID'
          ORDER BY c."inventoryProductId", c."locationId", c."createdAt" DESC, c."countDate" DESC, c.id DESC
        ) c
        LEFT JOIN "User" u ON u.id = c."countedByUserId") AS latest_counts
  `;
  const row = rows[0];
  const locations = parseJsonArray<Record<string, unknown>>(row?.locations).map((loc) => ({
    id: String(loc.id),
    name: String(loc.name ?? ""),
    code: loc.code == null ? null : String(loc.code),
    description: loc.description == null ? null : String(loc.description),
    locationType: String(loc.locationType ?? "WAREHOUSE"),
    targetProductCount: loc.targetProductCount == null ? null : Number(loc.targetProductCount),
    color: loc.color == null ? null : String(loc.color),
    isActive: Boolean(loc.isActive),
    createdAt: loc.createdAt instanceof Date ? loc.createdAt : new Date(String(loc.createdAt)),
    displayOrder: Number(loc.displayOrder ?? 0),
  }));
  const products = parseJsonArray<Record<string, unknown>>(row?.products).map((p) => ({
    id: String(p.id),
    location: String(p.location ?? ""),
    locationId: p.locationId == null ? null : String(p.locationId),
    _count: { placements: Number(p.placement_count ?? 0) },
  }));
  const placements = parseJsonArray<Record<string, unknown>>(row?.placements).map((pl) => ({
    inventoryProductId: String(pl.inventoryProductId),
    locationId: String(pl.locationId),
  }));
  const latestCountsAll: CountDiffRow[] = parseJsonArray<Record<string, unknown>>(row?.latest_counts).map((c) => ({
    inventoryProductId: String(c.inventoryProductId),
    locationId: c.locationId == null ? null : String(c.locationId),
    difference: Number(c.difference ?? 0),
    countDate: c.countDate instanceof Date ? c.countDate : new Date(String(c.countDate)),
    countedBy: c.countedByName ? { fullName: String(c.countedByName) } : null,
  }));
  return [locations, products, placements, latestCountsAll];
}

/**
 * סיכומי כל המדפים — חברות לפי placements (SSOT) + legacy רק למוצרים ללא placements.
 * סטטוס ספירה לפי ספירות של אותו locationId בלבד.
 */
export async function listShelfSummariesViaPrisma(): Promise<ShelfSummaryStats[]> {
  const [locations, products, placements, latestCountsAll] = await Promise.all([
    loadLocationsForSummaries(),
    prismaAny.inventoryProduct.findMany({
      where: {
        OR: [
          { locationId: { not: null } },
          { NOT: { location: { equals: "", mode: "insensitive" } } },
          { placements: { some: {} } },
        ],
      },
      select: {
        id: true,
        location: true,
        locationId: true,
        _count: { select: { placements: true } },
      },
    }),
    prismaAny.inventoryProductOnLocation.findMany({
      select: { inventoryProductId: true, locationId: true },
    }),
    prismaAny.inventoryCount.findMany({
      where: ACTIVE_COUNT_LINE_WHERE,
      orderBy: LATEST_COUNT_ORDER_BY,
      distinct: ["inventoryProductId", "locationId"],
      select: {
        inventoryProductId: true,
        locationId: true,
        difference: true,
        countDate: true,
        countedBy: { select: { fullName: true } },
      },
    }) as Promise<CountDiffRow[]>,
  ]);
  return assembleShelfSummaries(locations, products, placements, latestCountsAll);
}

export async function listShelfSummaries(): Promise<ShelfSummaryStats[]> {
  const [locations, products, placements, latestCountsAll] = await loadShelfSummarySnapshot();
  return assembleShelfSummaries(locations, products, placements, latestCountsAll);
}

function assembleShelfSummaries(
  locations: unknown,
  products: unknown,
  placements: unknown,
  latestCountsAll: CountDiffRow[],
): ShelfSummaryStats[] {

  type LocRow = {
    id: string;
    name: string;
    code: string | null;
    description: string | null;
    locationType: string;
    targetProductCount: number | null;
    color: string | null;
    isActive: boolean;
    createdAt: Date;
    displayOrder: number;
  };

  const locs = locations as LocRow[];
  const locByName = new Map<string, LocRow>();
  for (const loc of locs) {
    locByName.set(loc.name.trim().toLowerCase(), loc);
  }

  /** shelfKey → productIds (Set למניעת כפילות באותו מדף) */
  const members = new Map<string, Set<string>>();
  const meta = new Map<
    string,
    {
      name: string;
      locationId: string | null;
      code: string | null;
      description: string | null;
      locationType: string;
      targetProductCount: number | null;
      color: string | null;
      isActive: boolean;
      createdAt: string | null;
      displayOrder: number;
    }
  >();

  const ensureShelf = (
    key: string,
    seed: {
      name: string;
      locationId: string | null;
      code?: string | null;
      description?: string | null;
      locationType?: string;
      targetProductCount?: number | null;
      color?: string | null;
      isActive?: boolean;
      createdAt?: string | null;
      displayOrder?: number;
    },
  ) => {
    if (!members.has(key)) members.set(key, new Set());
    if (!meta.has(key)) {
      meta.set(key, {
        name: seed.name,
        locationId: seed.locationId,
        code: seed.code ?? null,
        description: seed.description ?? null,
        locationType: seed.locationType ?? "WAREHOUSE",
        targetProductCount: seed.targetProductCount ?? null,
        color: seed.color ?? null,
        isActive: seed.isActive ?? true,
        createdAt: seed.createdAt ?? null,
        displayOrder: seed.displayOrder ?? 0,
      });
    }
  };

  for (const loc of locs) {
    ensureShelf(loc.id, {
      name: loc.name.trim(),
      locationId: loc.id,
      code: loc.code,
      description: loc.description,
      locationType: loc.locationType || "WAREHOUSE",
      targetProductCount: loc.targetProductCount,
      color: loc.color,
      isActive: loc.isActive,
      createdAt: loc.createdAt.toISOString(),
      displayOrder: loc.displayOrder ?? 0,
    });
  }

  for (const pl of placements as Array<{ inventoryProductId: string; locationId: string }>) {
    if (!members.has(pl.locationId)) continue;
    members.get(pl.locationId)!.add(pl.inventoryProductId);
  }

  // legacy: רק מוצרים ללא placements — לא מדליפים ממחסן אחר
  for (const p of products as Array<{
    id: string;
    location: string;
    locationId: string | null;
    _count: { placements: number };
  }>) {
    if (p._count.placements > 0) continue;

    const locId = p.locationId?.trim() || null;
    if (locId && members.has(locId)) {
      members.get(locId)!.add(p.id);
      continue;
    }

    const textName = (p.location ?? "").trim();
    if (!textName) continue;
    const byName = locByName.get(textName.toLowerCase());
    if (byName) {
      members.get(byName.id)!.add(p.id);
      continue;
    }
    if (!locId) {
      const key = `name:${textName}`;
      ensureShelf(key, { name: textName, locationId: null, displayOrder: 999999 });
      members.get(key)!.add(p.id);
    }
  }

  const allProductIds = [...new Set([...members.values()].flatMap((s) => [...s]))];
  const wantedProducts = new Set(allProductIds);
  const latestCounts =
    allProductIds.length === 0
      ? []
      : latestCountsAll.filter((row) => wantedProducts.has(row.inventoryProductId));

  const countsByProduct = new Map<string, CountDiffRow[]>();
  for (const c of latestCounts) {
    const list = countsByProduct.get(c.inventoryProductId) ?? [];
    list.push(c);
    countsByProduct.set(c.inventoryProductId, list);
  }

  return [...members.entries()]
    .map(([key, set]) => {
      const seed = meta.get(key)!;
      return toShelfSummaryStats(seed, [...set], countsByProduct);
    })
    .filter((s) => s.isActive || s.productCount > 0)
    .sort((a, b) => {
      if (a.displayOrder !== b.displayOrder) return a.displayOrder - b.displayOrder;
      return a.name.localeCompare(b.name, "he", { sensitivity: "base" });
    });
}

export async function summarizeShelf(shelf: ResolvedShelf): Promise<ShelfSummaryStats> {
  const where = productsOnShelfWhere(shelf);
  const [loc, rows] = await Promise.all([
    shelf.id
      ? prismaAny.inventoryLocation.findUnique({
          where: { id: shelf.id },
          select: {
            id: true,
            name: true,
            code: true,
            description: true,
            locationType: true,
            targetProductCount: true,
            color: true,
            isActive: true,
            createdAt: true,
            displayOrder: true,
          },
        })
      : prismaAny.inventoryLocation.findFirst({
          where: { name: { equals: shelf.name, mode: "insensitive" }, isActive: true },
          select: {
            id: true,
            name: true,
            code: true,
            description: true,
            locationType: true,
            targetProductCount: true,
            color: true,
            isActive: true,
            createdAt: true,
            displayOrder: true,
          },
        }),
    prismaAny.inventoryProduct.findMany({
      where,
      select: { id: true },
    }),
  ]);

  const productIds = (rows as { id: string }[]).map((r) => r.id);
  const latestCounts =
    productIds.length === 0
      ? ([] as CountDiffRow[])
      : ((await prismaAny.inventoryCount.findMany({
          where: { inventoryProductId: { in: productIds }, ...ACTIVE_COUNT_LINE_WHERE },
          orderBy: LATEST_COUNT_ORDER_BY,
          distinct: ["inventoryProductId", "locationId"],
          select: {
            inventoryProductId: true,
            locationId: true,
            difference: true,
            countDate: true,
            countedBy: { select: { fullName: true } },
          },
        })) as CountDiffRow[]);

  const countsByProduct = new Map<string, CountDiffRow[]>();
  for (const c of latestCounts) {
    const list = countsByProduct.get(c.inventoryProductId) ?? [];
    list.push(c);
    countsByProduct.set(c.inventoryProductId, list);
  }

  const locationId = loc?.id ?? shelf.id;
  return toShelfSummaryStats(
    {
      name: loc?.name ?? shelf.name,
      locationId,
      code: loc?.code ?? null,
      description: loc?.description ?? null,
      locationType: loc?.locationType ?? "WAREHOUSE",
      targetProductCount: loc?.targetProductCount ?? null,
      color: loc?.color ?? null,
      isActive: loc?.isActive ?? true,
      createdAt: loc?.createdAt ? loc.createdAt.toISOString() : null,
      displayOrder: loc?.displayOrder ?? 0,
    },
    productIds,
    countsByProduct,
  );
}
