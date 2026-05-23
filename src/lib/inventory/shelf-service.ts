import { prismaAny } from "@/lib/prisma";

export type ResolvedShelf = {
  id: string | null;
  name: string;
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

export function productsOnShelfWhere(shelf: ResolvedShelf) {
  if (shelf.id) {
    return {
      OR: [
        { locationId: shelf.id },
        { location: { equals: shelf.name, mode: "insensitive" as const } },
      ],
    };
  }
  return { location: { equals: shelf.name, mode: "insensitive" as const } };
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
      counts: {
        orderBy: { countDate: "desc" },
        take: 1,
        select: { difference: true },
      },
    },
  });
  let shortageCount = 0;
  let surplusCount = 0;
  let okCount = 0;
  for (const p of rows) {
    const latest = p.counts[0];
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
