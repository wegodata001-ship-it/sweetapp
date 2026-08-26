import { prismaAny } from "@/lib/prisma";
import { orderedProductIdsOnShelf, resolveShelf } from "@/lib/inventory/shelf-service";
import {
  emptyWeekdayValues,
  placementToWeekdayValues,
  type PlacementWeekdayMinimums,
  type WeekdayMinimumField,
  WEEKDAY_MINIMUM_FIELDS,
  parseWeekdayMinimumInput,
} from "@/lib/inventory/weekday-minimum";

export type WeekdayMinimumProductRow = {
  productId: string;
  name: string;
  unit: string | null;
  legacyMinimumQuantity: number;
  weekdays: Record<WeekdayMinimumField, number | null>;
};

const PLACEMENT_WEEKDAY_SELECT = {
  inventoryProductId: true,
  minimumQuantity: true,
  minimumSun: true,
  minimumMon: true,
  minimumTue: true,
  minimumWed: true,
  minimumThu: true,
  minimumFri: true,
  minimumSat: true,
} as const;

type PlacementRow = {
  inventoryProductId: string;
  minimumQuantity: number;
  minimumSun: number | null;
  minimumMon: number | null;
  minimumTue: number | null;
  minimumWed: number | null;
  minimumThu: number | null;
  minimumFri: number | null;
  minimumSat: number | null;
};

export async function loadWeekdayMinimumRows(locationId: string): Promise<{
  locationId: string;
  locationName: string;
  rows: WeekdayMinimumProductRow[];
}> {
  const shelf = await resolveShelf(locationId);
  if (!shelf?.id) {
    throw new Error("LOCATION_NOT_FOUND");
  }

  const productIds = await orderedProductIdsOnShelf(shelf);
  if (productIds.length === 0) {
    return { locationId: shelf.id, locationName: shelf.name, rows: [] };
  }

  const [products, placements] = await Promise.all([
    prismaAny.inventoryProduct.findMany({
      where: { id: { in: productIds } },
      select: {
        id: true,
        name: true,
        nameHe: true,
        nameAr: true,
        unit: true,
      },
    }) as Promise<
      {
        id: string;
        name: string;
        nameHe: string | null;
        nameAr: string | null;
        unit: string | null;
      }[]
    >,
    prismaAny.inventoryProductOnLocation.findMany({
      where: { locationId: shelf.id, inventoryProductId: { in: productIds } },
      select: PLACEMENT_WEEKDAY_SELECT,
    }) as Promise<PlacementRow[]>,
  ]);

  const productById = new Map(products.map((p) => [p.id, p]));
  const placementByProduct = new Map(placements.map((p) => [p.inventoryProductId, p]));

  const rows: WeekdayMinimumProductRow[] = [];
  for (const pid of productIds) {
    const p = productById.get(pid);
    if (!p) continue;
    const placement = placementByProduct.get(pid);
    const weekdays = placement
      ? placementToWeekdayValues(placement as PlacementWeekdayMinimums)
      : emptyWeekdayValues();
    rows.push({
      productId: pid,
      name: p.nameHe?.trim() || p.nameAr?.trim() || p.name,
      unit: p.unit,
      legacyMinimumQuantity: Number(placement?.minimumQuantity ?? 0),
      weekdays,
    });
  }

  return { locationId: shelf.id, locationName: shelf.name, rows };
}

export type WeekdayMinimumPatchRow = {
  productId: string;
  minimumSun?: number | null;
  minimumMon?: number | null;
  minimumTue?: number | null;
  minimumWed?: number | null;
  minimumThu?: number | null;
  minimumFri?: number | null;
  minimumSat?: number | null;
};

export async function bulkPatchWeekdayMinimums(
  locationId: string,
  patchRows: WeekdayMinimumPatchRow[],
): Promise<{ updated: number }> {
  const shelf = await resolveShelf(locationId);
  if (!shelf?.id) {
    throw new Error("LOCATION_NOT_FOUND");
  }

  const productIdsOnShelf = new Set(await orderedProductIdsOnShelf(shelf));
  let updated = 0;

  await prismaAny.$transaction(async (tx: typeof prismaAny) => {
    for (const row of patchRows) {
      const productId = row.productId?.trim();
      if (!productId || !productIdsOnShelf.has(productId)) continue;

      const data: Record<string, number | null> = {};
      for (const field of WEEKDAY_MINIMUM_FIELDS) {
        const parsed = parseWeekdayMinimumInput(row[field]);
        if (parsed === undefined) continue;
        data[field] = parsed;
      }
      if (Object.keys(data).length === 0) continue;

      const existing = await tx.inventoryProductOnLocation.findUnique({
        where: {
          inventoryProductId_locationId: {
            inventoryProductId: productId,
            locationId: shelf.id,
          },
        },
        select: { id: true },
      });
      if (!existing) continue;

      await tx.inventoryProductOnLocation.update({
        where: { id: existing.id },
        data,
      });
      updated += 1;
    }
  });

  return { updated };
}
