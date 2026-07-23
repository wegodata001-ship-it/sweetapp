import { prismaAny } from "@/lib/prisma";
import {
  serializeWorker,
  WORKER_SELECT,
  type LocationWorkerRow,
} from "@/lib/inventory/location-workers";

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

export async function summarizeShelf(shelf: ResolvedShelf) {
  const where = productsOnShelfWhere(shelf);
  const rows = await prismaAny.inventoryProduct.findMany({
    where,
    select: {
      id: true,
      counts: {
        where: shelf.id ? { OR: [{ locationId: shelf.id }, { locationId: null }] } : undefined,
        orderBy: { countDate: "desc" },
        take: 5,
        select: { difference: true, locationId: true, countDate: true },
      },
    },
  });
  let shortageCount = 0;
  let surplusCount = 0;
  let okCount = 0;
  for (const p of rows) {
    // העדפה לספירה עם locationId של המדף; אחרת ספירה ללא מיקום (legacy)
    const latest =
      (shelf.id ? p.counts.find((c: { locationId: string | null }) => c.locationId === shelf.id) : null) ??
      p.counts[0];
    if (!latest) continue;
    const diff = latest.difference;
    if (diff < 0) shortageCount += 1;
    else if (diff > 0) surplusCount += 1;
    else okCount += 1;
  }
  const productCount = rows.length;
  return {
    name: shelf.name,
    productCount,
    shortageCount,
    surplusCount,
    okCount,
    matchPct: productCount > 0 ? Math.round((okCount / productCount) * 100) : 100,
  };
}
