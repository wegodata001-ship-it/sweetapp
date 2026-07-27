import { prismaAny } from "@/lib/prisma";
import type { ResolvedShelf } from "@/lib/inventory/shelf-service";

/**
 * הסרת מוצר מסבב ספירה — Soft Delete בלבד.
 *
 * בזמן ספירה פעילה אין שורות InventoryCount ב־DB (הן נוצרות רק בשמירה),
 * ולכן ההסרה נשמרת בטבלה נפרדת ולא כשדה על שורת ספירה. כך:
 *   • לא נמחק מוצר, שיוך למדף, שורת ספירה או סשן.
 *   • ספירות עבר, היסטוריית מלאי, תנועות ודוחות אינם משתנים כלל.
 *   • ההסרה תקפה למיקום + יום הספירה בלבד, כך שבסבב הבא המוצר חוזר מעצמו.
 */

export type CountRoundScope = {
  /** מפתח הסבב — locationId, או "name:<שם מדף>" למדפי טקסט ישנים */
  locationKey: string;
  locationId: string | null;
  locationName: string;
  /** YYYY-MM-DD */
  countDay: string;
};

/**
 * מפתח מדף יציב. locationId עשוי להיות null (מדף טקסט ישן ללא InventoryLocation),
 * ובפוסטגרס NULL אינו ייחודי — לכן משתמשים במפתח טקסט שאינו null.
 */
export function shelfLocationKey(shelf: Pick<ResolvedShelf, "id" | "name">): string {
  if (shelf.id?.trim()) return shelf.id.trim();
  return `name:${shelf.name.trim().toLowerCase()}`;
}

/** תאריך מקומי כ־YYYY-MM-DD (ללא הסטת אזור זמן דרך toISOString) */
function localDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * נרמול יום הספירה. מקבל "YYYY-MM-DD" מהלקוח; כל קלט אחר (או חסר)
 * נופל להיום — כך שקריאות ישנות ללא countDate ממשיכות לעבוד.
 */
export function normalizeCountDay(raw: string | null | undefined): string {
  const value = raw?.trim();
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  if (value) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return localDay(parsed);
  }
  return localDay(new Date());
}

export function resolveCountRoundScope(
  shelf: Pick<ResolvedShelf, "id" | "name">,
  countDate: string | null | undefined,
): CountRoundScope {
  return {
    locationKey: shelfLocationKey(shelf),
    locationId: shelf.id?.trim() || null,
    locationName: shelf.name,
    countDay: normalizeCountDay(countDate),
  };
}

/** מזהי המוצרים שהוסרו מסבב הספירה הזה (מיקום + יום) */
export async function loadExcludedProductIds(
  scope: Pick<CountRoundScope, "locationKey" | "countDay">,
): Promise<string[]> {
  const rows = (await prismaAny.inventoryCountExclusion.findMany({
    where: {
      locationKey: scope.locationKey,
      countDay: scope.countDay,
      isRemoved: true,
    },
    select: { inventoryProductId: true },
  })) as { inventoryProductId: string }[];
  return rows.map((r) => r.inventoryProductId);
}

export type ExcludedRowDto = {
  id: string;
  inventoryProductId: string;
  productName: string;
  removedAt: string;
  removedByName: string | null;
  reason: string | null;
};

/** רשימת השורות שהוסרו — לתצוגת "הוסרו מהספירה" ולשחזור */
export async function listExcludedRows(
  scope: Pick<CountRoundScope, "locationKey" | "countDay">,
): Promise<ExcludedRowDto[]> {
  const rows = (await prismaAny.inventoryCountExclusion.findMany({
    where: {
      locationKey: scope.locationKey,
      countDay: scope.countDay,
      isRemoved: true,
    },
    orderBy: { removedAt: "desc" },
    select: {
      id: true,
      inventoryProductId: true,
      productName: true,
      reason: true,
      removedAt: true,
      removedBy: { select: { fullName: true } },
      inventoryProduct: { select: { name: true, nameHe: true, nameAr: true } },
    },
  })) as {
    id: string;
    inventoryProductId: string;
    productName: string;
    reason: string | null;
    removedAt: Date;
    removedBy: { fullName: string } | null;
    inventoryProduct: { name: string; nameHe: string | null; nameAr: string | null } | null;
  }[];

  return rows.map((r) => ({
    id: r.id,
    inventoryProductId: r.inventoryProductId,
    productName:
      r.productName.trim() ||
      r.inventoryProduct?.nameHe?.trim() ||
      r.inventoryProduct?.nameAr?.trim() ||
      r.inventoryProduct?.name ||
      "",
    removedAt: r.removedAt.toISOString(),
    removedByName: r.removedBy?.fullName ?? null,
    reason: r.reason,
  }));
}
