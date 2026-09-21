/**
 * העתקת ספירות היסטוריות לפי טווח תאריכים — Read Only.
 * מקור רשימת מוצרים: מוצרים פעילים על המיקום (כמו מסך הספירה).
 * כמויות: מ־InventoryCount של הסשן; מוצר בלי שורה = לא נספר (לא 0).
 * לא יוצר/מעדכן/מוחק ספירות או מלאי.
 */

import { prismaAny } from "@/lib/prisma";
import {
  ACTIVE_COUNT_LINE_WHERE,
  ACTIVE_SESSION_WHERE,
} from "@/lib/inventory/count-session-status";
import {
  LATEST_COUNT_ORDER_BY,
  productTotalsFromLatestCounts,
} from "@/lib/inventory/count-latest";
import { daySpanRange } from "@/lib/inventory/daily-count-report";
import {
  loadExcludedProductIds,
  normalizeCountDay,
  resolveCountRoundScope,
} from "@/lib/inventory/count-exclusions";
import {
  orderedProductIdsOnShelf,
  resolveShelf,
} from "@/lib/inventory/shelf-service";

export type CountCopyProduct = {
  inventoryProductId: string;
  name: string;
  nameHe: string | null;
  nameAr: string | null;
  nameEn: string | null;
  /**
   * הכמות שנשמרה בספירה ההיסטורית (כולל 0 מפורש).
   * null = אין רשומת ספירה ליום/סשן → «לא נספר».
   */
  quantity: number | null;
  /**
   * מלאי נוכחי אמיתי = SUM הספירה האחרונה בכל מיקום אחסון.
   * נפרד מסטטוס הספירה של הסשן — מוצר יכול להיות «לא נספר» ועדיין סה״כ > 0.
   */
  totalQuantity: number;
};

export type CountCopySession = {
  id: string;
  sessionNumber: number;
  locationId: string | null;
  locationName: string;
  /** ISO — יום הספירה העסקי */
  countDate: string;
  createdAt: string;
  products: CountCopyProduct[];
};

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidCopyYmd(value: string): boolean {
  if (!YMD_RE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
  return (
    dt.getFullYear() === y &&
    dt.getMonth() === (m ?? 1) - 1 &&
    dt.getDate() === d
  );
}

type ProductNameMeta = {
  name: string;
  nameHe: string | null;
  nameAr: string | null;
  nameEn: string | null;
};

type SessionLineQty = {
  inventoryProductId: string;
  currentQuantity: number;
  createdAt?: Date | string | null;
  countDate?: Date | string | null;
  id?: string | null;
};

/**
 * האם a «חדש יותר» מ־b לפי LATEST_COUNT_ORDER_BY:
 * createdAt desc → countDate desc → id desc
 */
export function isNewerCopyCountLine(
  a: Pick<SessionLineQty, "createdAt" | "countDate" | "id">,
  b: Pick<SessionLineQty, "createdAt" | "countDate" | "id">,
): boolean {
  const aCreated = a.createdAt != null ? new Date(a.createdAt).getTime() : -1;
  const bCreated = b.createdAt != null ? new Date(b.createdAt).getTime() : -1;
  if (aCreated !== bCreated) return aCreated > bCreated;
  const aCount = a.countDate != null ? new Date(a.countDate).getTime() : -1;
  const bCount = b.countDate != null ? new Date(b.countDate).getTime() : -1;
  if (aCount !== bCount) return aCount > bCount;
  const aId = a.id ?? "";
  const bId = b.id ?? "";
  return aId > bId;
}

/**
 * מפה productId → כמות מפורשת מהסשן.
 * כפילות: latest לפי LATEST_COUNT_ORDER_BY (createdAt/countDate/id).
 */
export function sessionLinesToExplicitCountMap(
  lines: SessionLineQty[],
): Map<string, number> {
  const best = new Map<string, { qty: number; meta: SessionLineQty }>();
  for (const line of lines) {
    const pid = line.inventoryProductId?.trim();
    if (!pid) continue;
    const qty = Number(line.currentQuantity);
    if (!Number.isFinite(qty) || qty < 0) continue;
    const prev = best.get(pid);
    if (!prev || isNewerCopyCountLine(line, prev.meta)) {
      best.set(pid, { qty, meta: line });
    }
  }
  const out = new Map<string, number>();
  for (const [pid, row] of best) out.set(pid, row.qty);
  return out;
}

/**
 * בונה שורות העתקה: כל מוצרי המיקום בסדר מסך הספירה,
 * עם כמות מהסשן או null (= לא נספר).
 */
export function buildCopyProductRows(params: {
  orderedProductIds: string[];
  productsById: Map<string, ProductNameMeta>;
  explicitCountsByProductId: Map<string, number>;
  totalsByProductId?: Map<string, number>;
}): CountCopyProduct[] {
  const rows: CountCopyProduct[] = [];
  for (const id of params.orderedProductIds) {
    const meta = params.productsById.get(id);
    if (!meta) continue;
    const hasCount = params.explicitCountsByProductId.has(id);
    const totalRaw = params.totalsByProductId?.get(id);
    rows.push({
      inventoryProductId: id,
      name: meta.nameHe?.trim() || meta.name,
      nameHe: meta.nameHe,
      nameAr: meta.nameAr,
      nameEn: meta.nameEn,
      quantity: hasCount ? params.explicitCountsByProductId.get(id)! : null,
      totalQuantity: Number.isFinite(totalRaw) ? Number(totalRaw) : 0,
    });
  }
  return rows;
}

/** תאריך להעתקה: 13/8 (ללא אפס מוביל) */
export function formatCopyCountDate(isoOrDate: string | Date): string {
  const d = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

export function formatCopyQuantity(qty: number): string {
  if (!Number.isFinite(qty)) return "0";
  if (Number.isInteger(qty)) return String(qty);
  const rounded = Math.round(qty * 1000) / 1000;
  return String(rounded);
}

export function notCountedCopyLabel(language?: string | null): string {
  const lang = (language || "").toLowerCase();
  if (lang.startsWith("ar")) return "لم يتم الجرد";
  if (lang.startsWith("en")) return "Not counted";
  return "לא נספר";
}

export function countedCopyLabel(language?: string | null): string {
  const lang = (language || "").toLowerCase();
  if (lang.startsWith("ar")) return "تم الجرد";
  if (lang.startsWith("en")) return "Counted";
  return "נספר";
}

export function totalCopyLabel(language?: string | null): string {
  const lang = (language || "").toLowerCase();
  if (lang.startsWith("ar")) return "الإجمالي";
  if (lang.startsWith("en")) return "Total";
  return "סה״כ";
}

/** כמות להעתקה — 0 מפורש נשאר "0"; null → לא נספר */
export function formatCopyQuantityOrStatus(
  quantity: number | null,
  language?: string | null,
): string {
  if (quantity === null) return notCountedCopyLabel(language);
  return formatCopyQuantity(quantity);
}

export function resolveCopyProductName(
  product: Pick<CountCopyProduct, "name" | "nameHe" | "nameAr" | "nameEn">,
  language?: string | null,
): string {
  const lang = (language || "").toLowerCase();
  if (lang.startsWith("ar") && product.nameAr?.trim()) return product.nameAr.trim();
  if (lang.startsWith("en") && product.nameEn?.trim()) return product.nameEn.trim();
  if (lang.startsWith("he") && product.nameHe?.trim()) return product.nameHe.trim();
  return (
    product.nameAr?.trim() ||
    product.nameHe?.trim() ||
    product.nameEn?.trim() ||
    product.name ||
    "—"
  );
}

/** טקסט מסודר להדבקה ב־WhatsApp / מייל */
export function formatCountSessionCopyText(
  session: CountCopySession,
  language?: string | null,
): string {
  const header = [
    session.locationName.trim() || "—",
    formatCopyCountDate(session.countDate),
  ].join("\n");
  const body = session.products.map((p, index) => {
    const name = resolveCopyProductName(p, language);
    const total = `${totalCopyLabel(language)}: ${formatCopyQuantity(p.totalQuantity)}`;
    const status =
      p.quantity === null
        ? notCountedCopyLabel(language)
        : `${formatCopyQuantity(p.quantity)}\n${countedCopyLabel(language)}`;
    return `${index + 1}. ${name}\n${total}\n${status}`;
  });
  return [header, ...body].join("\n\n");
}

export function formatAllCountSessionsCopyText(
  sessions: CountCopySession[],
  language?: string | null,
): string {
  return sessions
    .map((s) => formatCountSessionCopyText(s, language))
    .join("\n\n---\n\n");
}

/**
 * ספירות COMPLETED (לא VOID) בטווח לפי countDate.
 * רשימת מוצרים = מוצרי המיקום בסדר displayOrder (SSOT של מסך הספירה).
 */
export async function listSessionsForCopy(params: {
  from: string;
  to: string;
  locationId?: string | null;
  /** מגבלת סשנים — הגנה מפני טווחים ענקיים */
  take?: number;
}): Promise<CountCopySession[]> {
  const from = params.from.trim();
  const to = params.to.trim();
  if (!isValidCopyYmd(from) || !isValidCopyYmd(to)) {
    throw new Error("INVALID_DATE_RANGE");
  }
  if (from > to) {
    throw new Error("FROM_AFTER_TO");
  }

  const take = Math.min(200, Math.max(1, params.take ?? 100));
  const locationId = params.locationId?.trim() || null;
  const { start, end } = daySpanRange(from, to);

  const sessions = await prismaAny.inventoryCountSession.findMany({
    where: {
      ...ACTIVE_SESSION_WHERE,
      countDate: { gte: start, lt: end },
      ...(locationId ? { locationId } : {}),
    },
    orderBy: [
      { countDate: "asc" },
      { locationName: "asc" },
      { createdAt: "asc" },
      { sessionNumber: "asc" },
    ],
    take,
    select: {
      id: true,
      sessionNumber: true,
      locationId: true,
      locationName: true,
      countDate: true,
      createdAt: true,
      lines: {
        select: {
          id: true,
          inventoryProductId: true,
          currentQuantity: true,
          createdAt: true,
          countDate: true,
          inventoryProduct: {
            select: {
              name: true,
              nameHe: true,
              nameAr: true,
              nameEn: true,
            },
          },
        },
      },
    },
  });

  type SessionRow = {
    id: string;
    sessionNumber: number;
    locationId: string | null;
    locationName: string;
    countDate: Date;
    createdAt: Date;
    lines: Array<{
      id: string;
      inventoryProductId: string;
      currentQuantity: number;
      createdAt: Date;
      countDate: Date;
      inventoryProduct: ProductNameMeta;
    }>;
  };

  const typedSessions = sessions as SessionRow[];
  const locationIds = [
    ...new Set(
      typedSessions
        .map((s) => s.locationId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  /** locationId → ordered product ids (אחרי exclusions לפי יום — נבנה per-session) */
  const shelfByLocationId = new Map<
    string,
    { shelf: NonNullable<Awaited<ReturnType<typeof resolveShelf>>>; orderedIds: string[] }
  >();

  for (const lid of locationIds) {
    const shelf = await resolveShelf(lid);
    if (!shelf) continue;
    const orderedIds = await orderedProductIdsOnShelf(shelf);
    shelfByLocationId.set(lid, { shelf, orderedIds });
  }

  const allProductIds = new Set<string>();
  for (const { orderedIds } of shelfByLocationId.values()) {
    for (const id of orderedIds) allProductIds.add(id);
  }
  for (const session of typedSessions) {
    for (const line of session.lines) allProductIds.add(line.inventoryProductId);
  }

  const productRows =
    allProductIds.size === 0
      ? []
      : ((await prismaAny.inventoryProduct.findMany({
          where: { id: { in: [...allProductIds] } },
          select: {
            id: true,
            name: true,
            nameHe: true,
            nameAr: true,
            nameEn: true,
          },
        })) as Array<ProductNameMeta & { id: string }>);

  const productsById = new Map<string, ProductNameMeta>();
  for (const p of productRows) {
    productsById.set(p.id, {
      name: p.name,
      nameHe: p.nameHe,
      nameAr: p.nameAr,
      nameEn: p.nameEn,
    });
  }

  const latestCountRows =
    allProductIds.size === 0
      ? []
      : ((await prismaAny.inventoryCount.findMany({
          where: {
            inventoryProductId: { in: [...allProductIds] },
            ...ACTIVE_COUNT_LINE_WHERE,
          },
          orderBy: LATEST_COUNT_ORDER_BY,
          distinct: ["inventoryProductId", "locationId"],
          select: {
            inventoryProductId: true,
            locationId: true,
            currentQuantity: true,
          },
        })) as Array<{
          inventoryProductId: string;
          locationId: string | null;
          currentQuantity: number;
        }>);
  const totalsByProductId = productTotalsFromLatestCounts(latestCountRows);
  // fallback משורות הסשן אם המוצר נמחק מהקטלוג
  for (const session of typedSessions) {
    for (const line of session.lines) {
      if (!productsById.has(line.inventoryProductId)) {
        productsById.set(line.inventoryProductId, line.inventoryProduct);
      }
    }
  }

  const exclusionCache = new Map<string, string[]>();

  const result: CountCopySession[] = [];
  for (const session of typedSessions) {
    const explicitCounts = sessionLinesToExplicitCountMap(session.lines);
    const shelfInfo = session.locationId
      ? shelfByLocationId.get(session.locationId)
      : undefined;

    let orderedIds: string[];
    if (shelfInfo) {
      const countDay = normalizeCountDay(session.countDate.toISOString());
      const scope = resolveCountRoundScope(shelfInfo.shelf, countDay);
      const cacheKey = `${scope.locationKey}|${scope.countDay}`;
      let excluded = exclusionCache.get(cacheKey);
      if (!excluded) {
        excluded = await loadExcludedProductIds(scope);
        exclusionCache.set(cacheKey, excluded);
      }
      const excludedSet = new Set(excluded);
      orderedIds = shelfInfo.orderedIds.filter((id) => !excludedSet.has(id));
    } else {
      // מדף ללא locationId — נשארים עם שורות הסשן בלבד (legacy)
      orderedIds = session.lines.map((l) => l.inventoryProductId);
      // ייחודיות תוך שמירת סדר הופעה
      const seen = new Set<string>();
      orderedIds = orderedIds.filter((id) => {
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      });
    }

    const products = buildCopyProductRows({
      orderedProductIds: orderedIds,
      productsById,
      explicitCountsByProductId: explicitCounts,
      totalsByProductId,
    });

    result.push({
      id: session.id,
      sessionNumber: session.sessionNumber,
      locationId: session.locationId,
      locationName: session.locationName,
      countDate: session.countDate.toISOString(),
      createdAt: session.createdAt.toISOString(),
      products,
    });
  }

  return result;
}
