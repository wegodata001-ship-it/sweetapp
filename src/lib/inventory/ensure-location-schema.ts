import { prismaAny } from "@/lib/prisma";

/**
 * עמודות additive ממיגרציות אחרונות — אם הקוד עלה לפני migrate deploy,
 * שאילתות עם displayOrder/minimumQuantity מפילות את API והמסך נראה ריק.
 * ADD COLUMN IF NOT EXISTS בטוח, לא נוגע בנתונים/ספירות.
 */
let ensured: Promise<void> | null = null;

function isMissingColumnError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return (
    /displayOrder|minimumQuantity/i.test(msg) &&
    (/does not exist|Unknown column|column .+ does not exist|no such column/i.test(msg) ||
      msg.includes("P2022"))
  );
}

export async function ensureLocationSchemaColumns(): Promise<void> {
  if (!ensured) {
    ensured = (async () => {
      try {
        await prismaAny.$executeRawUnsafe(`
          ALTER TABLE "InventoryLocation"
            ADD COLUMN IF NOT EXISTS "displayOrder" INTEGER NOT NULL DEFAULT 0
        `);
        await prismaAny.$executeRawUnsafe(`
          CREATE INDEX IF NOT EXISTS "InventoryLocation_displayOrder_idx"
            ON "InventoryLocation"("displayOrder")
        `);
        await prismaAny.$executeRawUnsafe(`
          ALTER TABLE "InventoryProductOnLocation"
            ADD COLUMN IF NOT EXISTS "displayOrder" INTEGER NOT NULL DEFAULT 0
        `);
        await prismaAny.$executeRawUnsafe(`
          CREATE INDEX IF NOT EXISTS "InventoryProductOnLocation_locationId_displayOrder_idx"
            ON "InventoryProductOnLocation"("locationId", "displayOrder")
        `);
        await prismaAny.$executeRawUnsafe(`
          ALTER TABLE "InventoryProductOnLocation"
            ADD COLUMN IF NOT EXISTS "minimumQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0
        `);
        // Backfill מינימום ממוצר גלובלי — רק כשעדיין 0 (לא דורס ערכים קיימים)
        await prismaAny.$executeRawUnsafe(`
          UPDATE "InventoryProductOnLocation" AS pl
          SET "minimumQuantity" = COALESCE(p."minimumQuantity", 0)
          FROM "InventoryProduct" AS p
          WHERE pl."inventoryProductId" = p."id"
            AND pl."minimumQuantity" = 0
            AND COALESCE(p."minimumQuantity", 0) > 0
        `);
      } catch {
        // DB ללא הרשאת DDL / ספק אחר — נשארים עם fallback בשאילתות
      }
    })();
  }
  await ensured;
}

export { isMissingColumnError };
