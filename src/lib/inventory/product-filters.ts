import type { Prisma } from "@prisma/client";

export type StockFilterTier = "all" | "low" | "short" | "zero";

export type InventoryListQuery = {
  locationId?: string | null;
  /** סינון לפי שדה `location` (מחרוזת מדף/אזור) — עדיפות על פני locationId כשמוגדר */
  locationEquals?: string | null;
  /** מחרוזת חיפוש בשם */
  q?: string;
  category?: string;
  stock?: StockFilterTier;
  page?: number;
  pageSize?: number;
};

export type BuildInventoryWhereOpts = {
  /**
   * ספירה/ניהול לפי מדף ספציפי: לא לכלול פריטים בלי שיוך מיקום (ללא FK וללא טקסט מיקום).
   */
  excludeUntaggedInZone?: boolean;
};

const DEFAULT_PAGE_SIZE = 80;
const MAX_PAGE_SIZE = 200;

export function clampPageSize(n: number | undefined): number {
  if (n === undefined || !Number.isFinite(n)) return DEFAULT_PAGE_SIZE;
  return Math.min(MAX_PAGE_SIZE, Math.max(5, Math.floor(n)));
}

export function clampPage(n: number | undefined): number {
  if (n === undefined || !Number.isFinite(n)) return 1;
  return Math.max(1, Math.floor(n));
}

/** where בסיסי לפני סינון מלאי לפי ספירה אחרונה */
export function buildInventoryProductBaseWhere(
  q: InventoryListQuery,
  locationNameForLegacy?: string | null,
  opts?: BuildInventoryWhereOpts,
): Prisma.InventoryProductWhereInput {
  const parts: Prisma.InventoryProductWhereInput[] = [];

  if (q.q?.trim()) {
    parts.push({ name: { contains: q.q.trim(), mode: "insensitive" } });
  }
  if (q.category?.trim()) {
    parts.push({ category: q.category.trim() });
  }

  const locEq = q.locationEquals?.trim();
  if (locEq) {
    parts.push({ location: { equals: locEq, mode: "insensitive" } });
    if (parts.length === 1) return parts[0]!;
    return { AND: parts };
  }

  const lid = q.locationId?.trim();
  if (lid === "__none__") {
    parts.push({ locationId: null });
  } else if (lid) {
    const zoneMatch: Prisma.InventoryProductWhereInput = locationNameForLegacy
      ? {
          OR: [
            { locationId: lid },
            {
              AND: [
                { locationId: null },
                { location: { equals: locationNameForLegacy, mode: "insensitive" } },
              ],
            },
          ],
        }
      : { locationId: lid };

    if (opts?.excludeUntaggedInZone) {
      parts.push(zoneMatch);
      parts.push({
        OR: [{ locationId: { not: null } }, { NOT: { location: { equals: "", mode: "insensitive" } } }],
      });
    } else {
      parts.push(zoneMatch);
    }
  }

  if (parts.length === 0) return {};
  if (parts.length === 1) return parts[0]!;
  return { AND: parts };
}

export function classifyStockTier(
  current: number | null,
  minimumQuantity: number,
): "short" | "low" | "ok" | "zero" {
  const qty = current ?? 0;
  if (qty === 0) return "zero";
  if (minimumQuantity > 0 && qty < minimumQuantity) return "short";
  if (minimumQuantity > 0 && qty === minimumQuantity) return "low";
  return "ok";
}

export function matchesStockFilter(tier: ReturnType<typeof classifyStockTier>, stock: StockFilterTier): boolean {
  if (!stock || stock === "all") return true;
  if (stock === "short") return tier === "short";
  if (stock === "low") return tier === "short" || tier === "low";
  if (stock === "zero") return tier === "zero";
  return true;
}
