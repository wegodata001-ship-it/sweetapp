import { prismaAny } from "@/lib/prisma";
import {
  serializeWorker,
  WORKER_SELECT,
  type LocationWorkerRow,
} from "@/lib/inventory/location-workers";
import { LATEST_COUNT_ORDER_BY } from "@/lib/inventory/count-latest";
import { ACTIVE_COUNT_LINE_WHERE } from "@/lib/inventory/count-session-status";

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

/** מוצרים על מדף — כולל שיוך N:M + תאימות ל־locationId / טקסט ישן */
export function productsOnShelfWhere(shelf: ResolvedShelf) {
  if (shelf.id) {
    return {
      OR: [
        { placements: { some: { locationId: shelf.id } } },
        { locationId: shelf.id },
        { location: { equals: shelf.name, mode: "insensitive" as const } },
      ],
    };
  }
  return {
    OR: [
      { location: { equals: shelf.name, mode: "insensitive" as const } },
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
): Promise<void> {
  await tx.inventoryProductOnLocation.upsert({
    where: {
      inventoryProductId_locationId: {
        inventoryProductId: productId,
        locationId,
      },
    },
    create: { inventoryProductId: productId, locationId },
    update: {},
  });
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

function pickLatestCountForShelf(
  counts: CountDiffRow[],
  shelfId: string | null,
): CountDiffRow | null {
  if (shelfId) {
    return counts.find((c) => c.locationId === shelfId) ?? counts.find((c) => !c.locationId) ?? null;
  }
  return counts[0] ?? null;
}

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
    const latest = pickLatestCountForShelf(countsByProduct.get(pid) ?? [], seed.locationId);
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

/**
 * סיכומי כל המדפים — אותה חברות מוצר כמו productsOnShelfWhere / מסך הספירה
 * (placements N:M ∪ locationId ∪ טקסט location).
 */
export async function listShelfSummaries(): Promise<ShelfSummaryStats[]> {
  const [locations, products, placements] = await Promise.all([
    prismaAny.inventoryLocation.findMany({
      orderBy: { name: "asc" },
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
      },
    }),
    prismaAny.inventoryProduct.findMany({
      where: {
        OR: [
          { locationId: { not: null } },
          { NOT: { location: { equals: "", mode: "insensitive" } } },
          { placements: { some: {} } },
        ],
      },
      select: { id: true, location: true, locationId: true },
    }),
    prismaAny.inventoryProductOnLocation.findMany({
      select: { inventoryProductId: true, locationId: true },
    }),
  ]);

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
    });
  }

  for (const pl of placements as Array<{ inventoryProductId: string; locationId: string }>) {
    if (!members.has(pl.locationId)) continue;
    members.get(pl.locationId)!.add(pl.inventoryProductId);
  }

  for (const p of products as Array<{ id: string; location: string; locationId: string | null }>) {
    const locId = p.locationId?.trim() || null;
    if (locId && members.has(locId)) {
      members.get(locId)!.add(p.id);
    }

    const textName = (p.location ?? "").trim();
    if (!textName) continue;
    const byName = locByName.get(textName.toLowerCase());
    if (byName) {
      members.get(byName.id)!.add(p.id);
      continue;
    }
    // מדף טקסט יתום (אין InventoryLocation) — תאימות לאחור
    if (!locId) {
      const key = `name:${textName}`;
      ensureShelf(key, { name: textName, locationId: null });
      members.get(key)!.add(p.id);
    }
  }

  const allProductIds = [...new Set([...members.values()].flatMap((s) => [...s]))];
  const latestCounts =
    allProductIds.length === 0
      ? []
      : ((await prismaAny.inventoryCount.findMany({
          where: { inventoryProductId: { in: allProductIds }, ...ACTIVE_COUNT_LINE_WHERE },
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

  return [...members.entries()]
    .map(([key, set]) => {
      const seed = meta.get(key)!;
      return toShelfSummaryStats(seed, [...set], countsByProduct);
    })
    .filter((s) => s.isActive || s.productCount > 0)
    .sort((a, b) => a.name.localeCompare(b.name, "he", { sensitivity: "base" }));
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
    },
    productIds,
    countsByProduct,
  );
}
