import { Prisma } from "@prisma/client";
import { prismaAny } from "@/lib/prisma";
import { orderedProductIdsOnShelf, resolveShelf } from "@/lib/inventory/shelf-service";
import {
  emptyWeekdayValues,
  placementToWeekdayValues,
  prepareWeekdayMinimumUpdates,
  type PlacementWeekdayMinimums,
  type PreparedWeekdayUpdate,
  type WeekdayMinimumField,
  WEEKDAY_MINIMUM_FIELDS,
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

/** Active InventoryLocation only. resolveShelf rejects inactive and missing ids. */
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

/**
 * One UPDATE for every dirty product. Each row sets only the weekday columns
 * that were sent. No interactive transaction: the pooler closes those, and a
 * single statement is already atomic.
 */
export function weekdayMinimumUpdateSql(
  locationId: string,
  rows: PreparedWeekdayUpdate[],
): Prisma.Sql {
  const tuples = rows.map((row) => {
    const parts: Prisma.Sql[] = [Prisma.sql`${row.productId}::text`];
    for (const field of WEEKDAY_MINIMUM_FIELDS) {
      parts.push(Prisma.sql`${row.values[field]}::double precision`);
      parts.push(Prisma.sql`${row.set[field]}::boolean`);
    }
    return Prisma.sql`(${Prisma.join(parts, ", ")})`;
  });

  return Prisma.sql`
    UPDATE "InventoryProductOnLocation" AS p
    SET
      "minimumSun" = CASE WHEN v.set_sun THEN v.sun ELSE p."minimumSun" END,
      "minimumMon" = CASE WHEN v.set_mon THEN v.mon ELSE p."minimumMon" END,
      "minimumTue" = CASE WHEN v.set_tue THEN v.tue ELSE p."minimumTue" END,
      "minimumWed" = CASE WHEN v.set_wed THEN v.wed ELSE p."minimumWed" END,
      "minimumThu" = CASE WHEN v.set_thu THEN v.thu ELSE p."minimumThu" END,
      "minimumFri" = CASE WHEN v.set_fri THEN v.fri ELSE p."minimumFri" END,
      "minimumSat" = CASE WHEN v.set_sat THEN v.sat ELSE p."minimumSat" END
    FROM (VALUES ${Prisma.join(tuples)}) AS v(
      product_id,
      sun, set_sun,
      mon, set_mon,
      tue, set_tue,
      wed, set_wed,
      thu, set_thu,
      fri, set_fri,
      sat, set_sat
    )
    WHERE p."inventoryProductId" = v.product_id
      AND p."locationId" = ${locationId}
      AND EXISTS (
        SELECT 1
        FROM "InventoryLocation" AS loc
        WHERE loc.id = p."locationId"
          AND loc."isActive" = true
      )
  `;
}

export type WeekdayMinimumSaveTimings = {
  updated: number;
  rows: number;
  dbOperations: number;
  prepareMs: number;
  transactionMs: number;
  totalMs: number;
};

export async function bulkPatchWeekdayMinimums(
  locationId: string,
  patchRows: WeekdayMinimumPatchRow[],
): Promise<WeekdayMinimumSaveTimings> {
  const started = performance.now();
  const shelf = await resolveShelf(locationId);
  if (!shelf?.id) {
    throw new Error("LOCATION_NOT_FOUND");
  }

  const prepareStart = performance.now();
  const prepared = prepareWeekdayMinimumUpdates(patchRows);
  const prepareMs = performance.now() - prepareStart;
  if (prepared.length === 0) {
    return {
      updated: 0,
      rows: 0,
      dbOperations: 1,
      prepareMs,
      transactionMs: 0,
      totalMs: prepareMs,
    };
  }

  const sql = weekdayMinimumUpdateSql(shelf.id, prepared);
  const txStart = performance.now();
  const updated = Number(await prismaAny.$executeRaw(sql));
  const transactionMs = performance.now() - txStart;

  if (updated === 0) {
    const stillActive = await resolveShelf(shelf.id);
    if (!stillActive?.id) throw new Error("LOCATION_NOT_FOUND");
  }

  const totalMs = performance.now() - started;
  const timings: WeekdayMinimumSaveTimings = {
    updated,
    rows: prepared.length,
    dbOperations: updated === 0 ? 3 : 2,
    prepareMs,
    transactionMs,
    totalMs,
  };
  console.info(
    "[weekday-minimums] save",
    JSON.stringify({
      PREPARE_MS: Math.round(prepareMs),
      TRANSACTION_START: Math.round(txStart),
      DB_OPERATIONS: timings.dbOperations,
      TRANSACTION_MS: Math.round(transactionMs),
      TOTAL_SAVE_MS: Math.round(totalMs),
      ROWS_UPDATED: updated,
      ROWS: prepared.length,
    }),
  );
  return timings;
}
