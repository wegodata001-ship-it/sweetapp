/**
 * העתקת ספירות היסטוריות לפי טווח תאריכים — Read Only.
 * SSOT: InventoryCountSession + InventoryCount (שורות שנשמרו בפועל).
 * לא יוצר/מעדכן/מוחק ספירות או מלאי.
 */

import { prismaAny } from "@/lib/prisma";
import { ACTIVE_SESSION_WHERE } from "@/lib/inventory/count-session-status";
import { daySpanRange } from "@/lib/inventory/daily-count-report";

export type CountCopyProduct = {
  inventoryProductId: string;
  name: string;
  nameHe: string | null;
  nameAr: string | null;
  nameEn: string | null;
  /** הכמות שנשמרה בספירה ההיסטורית (כולל 0) */
  quantity: number;
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

/**
 * ספירות COMPLETED (לא VOID) בטווח לפי countDate.
 * מוצרים בסדר placement.displayOrder של המיקום; כמויות 0 נשמרות.
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
          inventoryProductId: true,
          currentQuantity: true,
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

  const locationIds = [
    ...new Set(
      sessions
        .map((s: { locationId: string | null }) => s.locationId)
        .filter((id: string | null): id is string => Boolean(id)),
    ),
  ];

  const orderByLocation = new Map<string, Map<string, number>>();
  if (locationIds.length > 0) {
    const placements = await prismaAny.inventoryProductOnLocation.findMany({
      where: { locationId: { in: locationIds } },
      select: {
        locationId: true,
        inventoryProductId: true,
        displayOrder: true,
      },
      orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
    });
    for (const pl of placements as Array<{
      locationId: string;
      inventoryProductId: string;
      displayOrder: number;
    }>) {
      let map = orderByLocation.get(pl.locationId);
      if (!map) {
        map = new Map();
        orderByLocation.set(pl.locationId, map);
      }
      if (!map.has(pl.inventoryProductId)) {
        map.set(pl.inventoryProductId, pl.displayOrder);
      }
    }
  }

  return sessions.map(
    (session: {
      id: string;
      sessionNumber: number;
      locationId: string | null;
      locationName: string;
      countDate: Date;
      createdAt: Date;
      lines: Array<{
        inventoryProductId: string;
        currentQuantity: number;
        inventoryProduct: {
          name: string;
          nameHe: string | null;
          nameAr: string | null;
          nameEn: string | null;
        };
      }>;
    }) => {
      const orderMap = session.locationId
        ? orderByLocation.get(session.locationId)
        : undefined;

      const products: CountCopyProduct[] = session.lines.map((line) => ({
        inventoryProductId: line.inventoryProductId,
        name: line.inventoryProduct.nameHe?.trim() || line.inventoryProduct.name,
        nameHe: line.inventoryProduct.nameHe,
        nameAr: line.inventoryProduct.nameAr,
        nameEn: line.inventoryProduct.nameEn,
        quantity: Number(line.currentQuantity) || 0,
      }));

      products.sort((a, b) => {
        const ao = orderMap?.get(a.inventoryProductId);
        const bo = orderMap?.get(b.inventoryProductId);
        if (ao != null && bo != null && ao !== bo) return ao - bo;
        if (ao != null && bo == null) return -1;
        if (ao == null && bo != null) return 1;
        return a.name.localeCompare(b.name, "he", { sensitivity: "base" });
      });

      return {
        id: session.id,
        sessionNumber: session.sessionNumber,
        locationId: session.locationId,
        locationName: session.locationName,
        countDate: session.countDate.toISOString(),
        createdAt: session.createdAt.toISOString(),
        products,
      };
    },
  );
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
    "",
  ];
  const body = session.products.map((p, index) => {
    const name = resolveCopyProductName(p, language);
    return `${index + 1}. ${name}. ${formatCopyQuantity(p.quantity)}`;
  });
  return [...header, ...body].join("\n");
}

export function formatAllCountSessionsCopyText(
  sessions: CountCopySession[],
  language?: string | null,
): string {
  return sessions
    .map((s) => formatCountSessionCopyText(s, language))
    .join("\n\n---\n\n");
}
