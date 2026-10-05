import { Prisma } from "@prisma/client";
import { prisma, prismaAny } from "@/lib/prisma";
import { resolveShelf } from "@/lib/inventory/shelf-service";
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

type WeekdaySqlRow = {
  location_id: string;
  location_name: string;
  product_id: string | null;
  product_name: string | null;
  unit: string | null;
  legacy_min: number | null;
  minimum_sun: number | null;
  minimum_mon: number | null;
  minimum_tue: number | null;
  minimum_wed: number | null;
  minimum_thu: number | null;
  minimum_fri: number | null;
  minimum_sat: number | null;
  has_placement: boolean | null;
};

/** Active InventoryLocation only. One SQL: location + placement order + weekday columns. */
export async function loadWeekdayMinimumRows(locationId: string): Promise<{
  locationId: string;
  locationName: string;
  rows: WeekdayMinimumProductRow[];
}> {
  const raw = await prisma.$queryRaw<WeekdaySqlRow[]>`
    WITH loc AS (
      SELECT id, name
      FROM "InventoryLocation"
      WHERE id = ${locationId} AND "isActive" = true
      LIMIT 1
    ),
    placed AS (
      SELECT
        pol."inventoryProductId" AS product_id,
        pol."displayOrder" AS place_order,
        pol."createdAt" AS place_created,
        0 AS src,
        pol."minimumQuantity" AS legacy_min,
        pol."minimumSun" AS minimum_sun,
        pol."minimumMon" AS minimum_mon,
        pol."minimumTue" AS minimum_tue,
        pol."minimumWed" AS minimum_wed,
        pol."minimumThu" AS minimum_thu,
        pol."minimumFri" AS minimum_fri,
        pol."minimumSat" AS minimum_sat,
        true AS has_placement
      FROM "InventoryProductOnLocation" pol
      INNER JOIN loc ON loc.id = pol."locationId"
    ),
    legacy AS (
      SELECT
        p.id AS product_id,
        p."displayOrder" AS place_order,
        p."createdAt" AS place_created,
        1 AS src,
        0::double precision AS legacy_min,
        NULL::double precision AS minimum_sun,
        NULL::double precision AS minimum_mon,
        NULL::double precision AS minimum_tue,
        NULL::double precision AS minimum_wed,
        NULL::double precision AS minimum_thu,
        NULL::double precision AS minimum_fri,
        NULL::double precision AS minimum_sat,
        false AS has_placement
      FROM "InventoryProduct" p
      CROSS JOIN loc
      WHERE p.id NOT IN (SELECT product_id FROM placed)
        AND (
          (
            p."locationId" = loc.id
            AND NOT EXISTS (
              SELECT 1 FROM "InventoryProductOnLocation" x
              WHERE x."inventoryProductId" = p.id
            )
          )
          OR (
            p."locationId" IS NULL
            AND lower(p.location) = lower(loc.name)
            AND NOT EXISTS (
              SELECT 1 FROM "InventoryProductOnLocation" x
              WHERE x."inventoryProductId" = p.id
            )
          )
        )
    ),
    ordered AS (
      SELECT * FROM placed
      UNION ALL
      SELECT * FROM legacy
    )
    SELECT
      loc.id AS location_id,
      loc.name AS location_name,
      o.product_id,
      COALESCE(NULLIF(BTRIM(p."nameHe"), ''), NULLIF(BTRIM(p."nameAr"), ''), p.name) AS product_name,
      p.unit,
      o.legacy_min,
      o.minimum_sun,
      o.minimum_mon,
      o.minimum_tue,
      o.minimum_wed,
      o.minimum_thu,
      o.minimum_fri,
      o.minimum_sat,
      o.has_placement
    FROM loc
    LEFT JOIN ordered o ON true
    LEFT JOIN "InventoryProduct" p ON p.id = o.product_id
    ORDER BY
      o.src ASC NULLS LAST,
      CASE WHEN o.src = 0 THEN o.place_order END ASC,
      CASE WHEN o.src = 0 THEN o.place_created END ASC,
      CASE WHEN o.src = 1 THEN o.place_order END ASC,
      CASE WHEN o.src = 1 THEN p.name END ASC
  `;

  if (raw.length === 0) {
    throw new Error("LOCATION_NOT_FOUND");
  }

  const locationName = raw[0].location_name;
  const rows: WeekdayMinimumProductRow[] = [];
  for (const row of raw) {
    if (!row.product_id || !row.product_name) continue;
    const weekdays = row.has_placement
      ? placementToWeekdayValues({
          minimumSun: row.minimum_sun,
          minimumMon: row.minimum_mon,
          minimumTue: row.minimum_tue,
          minimumWed: row.minimum_wed,
          minimumThu: row.minimum_thu,
          minimumFri: row.minimum_fri,
          minimumSat: row.minimum_sat,
        } as PlacementWeekdayMinimums)
      : emptyWeekdayValues();
    rows.push({
      productId: row.product_id,
      name: row.product_name,
      unit: row.unit,
      legacyMinimumQuantity: Number(row.legacy_min ?? 0),
      weekdays,
    });
  }

  return { locationId: raw[0].location_id, locationName, rows };
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
