import { NextRequest, NextResponse } from "next/server";
import { prismaAny } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";

/** כמויות מלאי לפי מיקום — לא לפי משתמש; תמיד דינמי */
export const dynamic = "force-dynamic";
export const revalidate = 0;
import {
  classifyStockTier,
  clampPage,
  clampPageSize,
  matchesStockFilter,
  type StockFilterTier,
} from "@/lib/inventory/product-filters";
import {
  orderedProductIdsOnShelf,
  productsOnShelfWhere,
  resolveShelf,
  resolveShelfWithWorkers,
} from "@/lib/inventory/shelf-service";
import {
  LATEST_COUNT_ORDER_BY,
  pickLatestCountForLocation,
  previousQtyFromCounts,
  requiredQtyToMinimum,
  resolveCountDefaultMinimum,
  resolveLocationMinimum,
  systemTotalFromCounts,
} from "@/lib/inventory/count-latest";
import {
  loadExcludedProductIds,
  resolveCountRoundScope,
} from "@/lib/inventory/count-exclusions";
import { ACTIVE_COUNT_LINE_WHERE } from "@/lib/inventory/count-session-status";
import { loadExistingCountToday } from "@/lib/inventory/count-round-guard";
import { scheduleCountSessionCompletedAlert } from "@/lib/inventory/count-session-alert";
import { ensureLocationSchemaColumns } from "@/lib/inventory/ensure-location-schema";

/**
 * שעת פתיחת הספירה מהלקוח.
 * נשמרת רק כשהיא סבירה (בעבר, ולא יותר מ־24 שעות אחורה), כדי שמשך הספירה
 * בדוחות יהיה נתון אמיתי ולא ערך שהגיע משעון לקוח שגוי.
 */
function parseCountStartedAt(raw: string | null | undefined): Date | null {
  const value = raw?.trim();
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  const ms = Date.now() - parsed.getTime();
  if (ms < 0 || ms > 24 * 60 * 60_000) return null;
  return parsed;
}

const PRODUCT_SELECT = {
  id: true,
  name: true,
  nameHe: true,
  nameAr: true,
  nameEn: true,
  barcode: true,
  sku: true,
  location: true,
  locationId: true,
  unit: true,
  minimumQuantity: true,
  maximumQuantity: true,
  displayOrder: true,
  inventoryLocation: { select: { name: true } },
} as const;

type ProductRow = {
  id: string;
  name: string;
  nameHe: string | null;
  nameAr: string | null;
  nameEn: string | null;
  barcode: string | null;
  sku: string | null;
  location: string;
  locationId: string | null;
  unit: string | null;
  minimumQuantity: number;
  maximumQuantity: number | null;
  displayOrder?: number;
  inventoryLocation?: { name: string } | null;
};

type CountQtyRow = {
  id: string;
  inventoryProductId: string;
  locationId: string | null;
  currentQuantity: number;
  /** Snapshot מינימום בשורת הספירה האחרונה (null בשורות ישנות לפני המיגרציה) */
  minimumQuantity?: number | null;
  countDate: Date;
  createdAt: Date;
  workerLines: {
    inventoryLocationWorkerId: string;
    countedQuantity: number;
  }[];
};

async function loadLatestCountsForProducts(productIds: string[]): Promise<Map<string, CountQtyRow[]>> {
  const countsByProduct = new Map<string, CountQtyRow[]>();
  if (productIds.length === 0) return countsByProduct;
  const latestCounts = (await prismaAny.inventoryCount.findMany({
    where: { inventoryProductId: { in: productIds }, ...ACTIVE_COUNT_LINE_WHERE },
    orderBy: LATEST_COUNT_ORDER_BY,
    distinct: ["inventoryProductId", "locationId"],
    select: {
      id: true,
      inventoryProductId: true,
      locationId: true,
      currentQuantity: true,
      minimumQuantity: true,
      countDate: true,
      createdAt: true,
      workerLines: {
        select: {
          inventoryLocationWorkerId: true,
          countedQuantity: true,
        },
      },
    },
  })) as CountQtyRow[];
  for (const c of latestCounts) {
    const list = countsByProduct.get(c.inventoryProductId) ?? [];
    list.push(c);
    countsByProduct.set(c.inventoryProductId, list);
  }
  return countsByProduct;
}

async function loadPlacementMinimums(
  locationId: string | null,
  productIds: string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!locationId || productIds.length === 0) return out;
  const rows = (await prismaAny.inventoryProductOnLocation.findMany({
    where: { locationId, inventoryProductId: { in: productIds } },
    select: { inventoryProductId: true, minimumQuantity: true },
  })) as { inventoryProductId: string; minimumQuantity: number }[];
  for (const r of rows) {
    out.set(r.inventoryProductId, Number(r.minimumQuantity) || 0);
  }
  return out;
}

function mapProductRow(
  p: ProductRow,
  shelf: { id: string | null; name: string },
  countsByProduct: Map<string, CountQtyRow[]>,
  placementMinimums: Map<string, number>,
) {
  const counts = countsByProduct.get(p.id) ?? [];
  const locationName = shelf.name || p.inventoryLocation?.name || p.location || "";
  const latestForShelf = pickLatestCountForLocation(counts, shelf.id);
  const locationQty = previousQtyFromCounts(counts, shelf.id);
  /** SUM גלובלי — לדוחות בלבד; לא מוצג כמלאי במסך ספירת Location */
  const businessTotal = systemTotalFromCounts(counts);
  const hasPlacementMin = placementMinimums.has(p.id);
  const locationMin = resolveCountDefaultMinimum({
    hasLastCountForLocation: latestForShelf != null,
    lastCountMinimum: latestForShelf?.minimumQuantity,
    placementMinimum: hasPlacementMin ? placementMinimums.get(p.id) : null,
    productMinimum: p.minimumQuantity,
  });
  const locationRequired = requiredQtyToMinimum(locationQty, locationMin);
  const tier = classifyStockTier(locationQty, locationMin);
  const lastWorkerQtys =
    latestForShelf?.workerLines?.map((w) => ({
      inventoryLocationWorkerId: w.inventoryLocationWorkerId,
      countedQuantity: w.countedQuantity,
    })) ?? [];
  return {
    id: p.id,
    name: p.nameHe?.trim() || p.nameAr?.trim() || p.name,
    nameHe: p.nameHe,
    nameAr: p.nameAr,
    nameEn: p.nameEn,
    barcode: p.barcode,
    sku: p.sku,
    location: locationName,
    locationId: shelf.id,
    unit: p.unit,
    previousQuantity: locationQty,
    /** מלאי במקום האחסון הנוכחי (לא SUM בין מחסנים) */
    locationQuantity: locationQty,
    systemTotalQuantity: locationQty,
    businessTotalQuantity: businessTotal,
    systemShortage: locationRequired,
    /** الكمية المطلوبة = חסר למינימום לפי מלאי המיקום */
    requiredQuantity: locationRequired,
    /** מינימום לפי מקום (placement); fallback למינימום מוצר ישן */
    minimumQuantity: locationMin,
    productMinimumQuantity: p.minimumQuantity,
    maximumQuantity: p.maximumQuantity,
    displayOrder: p.displayOrder ?? 0,
    lastCountedAt: latestForShelf?.countDate
      ? new Date(latestForShelf.countDate).toISOString()
      : null,
    lastWorkerQtys,
    stockTier: tier,
  };
}

export async function GET(req: NextRequest) {
  const block = await requireDb();
  if (block) return block;
  const { searchParams } = req.nextUrl;

  const locationEq = searchParams.get("location")?.trim() || undefined;
  const locationIdParam = searchParams.get("locationId")?.trim() || undefined;
  const q = searchParams.get("q")?.trim() || undefined;
  const category = searchParams.get("category")?.trim() || undefined;
  const stock = (searchParams.get("stock") as StockFilterTier) || "all";
  const page = clampPage(parseInt(searchParams.get("page") || "1", 10));
  /** מקסימום 100 — אין טעינת 500 בבת אחת */
  const pageSize = Math.min(100, clampPageSize(parseInt(searchParams.get("pageSize") || "80", 10)));

  if (!locationEq && !locationIdParam) {
    return NextResponse.json({
      ok: true,
      data: [],
      meta: { total: 0, page, pageSize, stock, needsLocation: true, hasMore: false },
    });
  }

  try {
    await ensureLocationSchemaColumns();
    const shelf = await resolveShelfWithWorkers(locationIdParam ?? null, locationEq);
    if (!shelf) {
      return NextResponse.json({
        ok: true,
        data: [],
        meta: { total: 0, page, pageSize, stock, needsLocation: true, hasMore: false },
      });
    }

    /**
     * מוצרים שהוסרו מסבב הספירה הזה (מיקום + יום) — מסתירים מהמסך בלבד.
     * הסינון כאן ולא בלקוח, כדי ש־total (ומכאן ה־KPI), החלוקה לעמודים
     * וה־infinite scroll יישארו נכונים גם אחרי רענון הדף.
     */
    const roundScope = resolveCountRoundScope(shelf, searchParams.get("countDate"));
    const [excludedProductIds, existingCountToday] = await Promise.all([
      loadExcludedProductIds(roundScope),
      loadExistingCountToday(roundScope),
    ]);

    const where: Record<string, unknown> = {
      AND: [
        productsOnShelfWhere(shelf),
        ...(excludedProductIds.length > 0 ? [{ id: { notIn: excludedProductIds } }] : []),
        ...(q
          ? [
              {
                OR: [
                  { name: { contains: q, mode: "insensitive" as const } },
                  { nameHe: { contains: q, mode: "insensitive" as const } },
                  { nameAr: { contains: q, mode: "insensitive" as const } },
                  { nameEn: { contains: q, mode: "insensitive" as const } },
                  { barcode: { contains: q, mode: "insensitive" as const } },
                  { sku: { contains: q, mode: "insensitive" as const } },
                ],
              },
            ]
          : []),
        ...(category ? [{ category }] : []),
      ],
    };

    // סדר לפי placement.displayOrder של המקום — לא גלובלי בין מחסנים
    let orderedIds = await orderedProductIdsOnShelf(shelf);
    if (excludedProductIds.length > 0) {
      const excluded = new Set(excludedProductIds);
      orderedIds = orderedIds.filter((id) => !excluded.has(id));
    }
    if (q || category) {
      const matched = (await prismaAny.inventoryProduct.findMany({
        where,
        select: { id: true },
      })) as { id: string }[];
      const matchSet = new Set(matched.map((m) => m.id));
      orderedIds = orderedIds.filter((id) => matchSet.has(id));
    }

    // סינון מלאי דורש כמויות — נתיב איטי יותר (תואם לאחור). מסך הספירה משתמש ב־stock=all.
    if (stock !== "all") {
      const products = (await prismaAny.inventoryProduct.findMany({
        where: { id: { in: orderedIds } },
        select: PRODUCT_SELECT,
      })) as ProductRow[];
      const byId = new Map(products.map((p) => [p.id, p]));
      const orderedProducts = orderedIds
        .map((id) => byId.get(id))
        .filter((p): p is ProductRow => !!p);
      const productIds = orderedProducts.map((p) => p.id);
      const [countsByProduct, placementMinimums] = await Promise.all([
        loadLatestCountsForProducts(productIds),
        loadPlacementMinimums(shelf.id, productIds),
      ]);
      const mapped = orderedProducts.map((p) =>
        mapProductRow(p, shelf, countsByProduct, placementMinimums),
      );
      const filtered = mapped.filter((m) => matchesStockFilter(m.stockTier, stock));
      const total = filtered.length;
      const start = (page - 1) * pageSize;
      const paged = filtered.slice(start, start + pageSize).map(({ stockTier: _s, ...rest }) => rest);
      return NextResponse.json({
        ok: true,
        data: paged,
        meta: {
          total,
          page,
          pageSize,
          stock,
          locationId: shelf.id,
          locationName: shelf.name,
          workers: shelf.workers,
          hasMore: start + pageSize < total,
          countDay: roundScope.countDay,
          removedCount: excludedProductIds.length,
          existingCountToday,
        },
      });
    }

    const total = orderedIds.length;
    const pageIds = orderedIds.slice((page - 1) * pageSize, page * pageSize);
    const products = (await prismaAny.inventoryProduct.findMany({
      where: { id: { in: pageIds } },
      select: PRODUCT_SELECT,
    })) as ProductRow[];
    const byId = new Map(products.map((p) => [p.id, p]));
    const orderedPage = pageIds.map((id) => byId.get(id)).filter((p): p is ProductRow => !!p);

    const pageProductIds = orderedPage.map((p) => p.id);
    const [countsByProduct, placementMinimums] = await Promise.all([
      loadLatestCountsForProducts(pageProductIds),
      loadPlacementMinimums(shelf.id, pageProductIds),
    ]);
    const paged = orderedPage.map((p) => {
      const { stockTier: _s, ...rest } = mapProductRow(
        p,
        shelf,
        countsByProduct,
        placementMinimums,
      );
      return rest;
    });

    return NextResponse.json({
      ok: true,
      data: paged,
      meta: {
        total,
        page,
        pageSize,
        stock,
        locationId: shelf.id,
        locationName: shelf.name,
        workers: shelf.workers,
        hasMore: page * pageSize < total,
        countDay: roundScope.countDay,
        removedCount: excludedProductIds.length,
        existingCountToday,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const block = await requireDb();
  if (block) return block;
  const session = await getSessionFromCookie();
  if (!session?.sub) {
    return NextResponse.json({ ok: false, error: "נדרשת התחברות" }, { status: 401 });
  }

  try {
    await ensureLocationSchemaColumns();
    const body = (await req.json()) as {
      countDate?: string | null;
      countedAt?: string | null;
      /** שעת פתיחת הספירה מהלקוח — אופציונלי, לחישוב משך הספירה בדוחות */
      startedAt?: string | null;
      locationId?: string | null;
      location?: string | null;
      lines: {
        inventoryProductId?: string;
        productId?: string;
        currentQuantity?: number;
        countedQuantity?: number;
        actualQty?: number;
        /** מינימום לספירה זו (snapshot) — מוצר+מיקום+סבב */
        minimumQuantity?: number;
        note?: string | null;
        notes?: string | null;
        workers?: {
          inventoryLocationWorkerId?: string;
          countedQuantity?: number;
        }[];
      }[];
    };
    if (!Array.isArray(body.lines) || body.lines.length === 0) {
      return NextResponse.json({ ok: false, error: "חסרים נתוני ספירה" }, { status: 400 });
    }

    const rawDate = body.countDate?.trim() || body.countedAt?.trim();
    /** תאריך עסקי מהלקוח + שעת שמירה אמיתית — מונע tie באותו יום */
    let countDate = new Date();
    if (rawDate) {
      // date-only: פרסינג מקומי (לא UTC midnight) + זמן שמירה נוכחי
      const ymd = rawDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (ymd) {
        const now = new Date();
        countDate = new Date(
          Number(ymd[1]),
          Number(ymd[2]) - 1,
          Number(ymd[3]),
          now.getHours(),
          now.getMinutes(),
          now.getSeconds(),
          now.getMilliseconds(),
        );
      } else {
        const parsed = new Date(rawDate);
        if (Number.isNaN(parsed.getTime())) {
          return NextResponse.json({ ok: false, error: "תאריך ספירה לא תקין" }, { status: 400 });
        }
        countDate = parsed;
      }
    }

    const shelf = await resolveShelf(body.locationId?.trim() ?? null, body.location?.trim());
    const locationId = shelf?.id ?? null;
    const locationName = shelf?.name ?? body.location?.trim() ?? "";
    const startedAt = parseCountStartedAt(body.startedAt);

    type PreparedWorker = {
      inventoryLocationWorkerId: string;
      countedQuantity: number;
      workerDisplayName: string;
      workerWorkArea: string;
    };
    type PreparedLine = {
      inventoryProductId: string;
      previousQuantity: number;
      currentQuantity: number;
      difference: number;
      minimumQuantity: number;
      note: string | null;
      workers: PreparedWorker[];
    };

    // Prefetch מחוץ ללולאה — לפני ה־TX (קריאה בלבד)
    const rawPids = [
      ...new Set(
        body.lines
          .map((l) => (l.inventoryProductId ?? l.productId)?.trim())
          .filter((id): id is string => !!id),
      ),
    ];
    const allWorkerIds = new Set<string>();
    for (const line of body.lines) {
      for (const w of line.workers ?? []) {
        const wid = w.inventoryLocationWorkerId?.trim();
        if (wid) allWorkerIds.add(wid);
      }
    }

    const [existingProducts, prevCounts, workers] = await Promise.all([
      prismaAny.inventoryProduct.findMany({
        where: { id: { in: rawPids } },
        select: {
          id: true,
          minimumQuantity: true,
          ...(locationId
            ? {
                placements: {
                  where: { locationId },
                  select: { minimumQuantity: true },
                  take: 1,
                },
              }
            : {}),
        },
      }),
      rawPids.length === 0
        ? Promise.resolve([] as CountQtyRow[])
        : (prismaAny.inventoryCount.findMany({
            where: { inventoryProductId: { in: rawPids }, ...ACTIVE_COUNT_LINE_WHERE },
            orderBy: LATEST_COUNT_ORDER_BY,
            distinct: ["inventoryProductId", "locationId"],
            select: {
              id: true,
              inventoryProductId: true,
              locationId: true,
              currentQuantity: true,
              minimumQuantity: true,
              countDate: true,
              createdAt: true,
              workerLines: {
                select: {
                  inventoryLocationWorkerId: true,
                  countedQuantity: true,
                },
              },
            },
          }) as Promise<CountQtyRow[]>),
      allWorkerIds.size > 0
        ? prismaAny.inventoryLocationWorker.findMany({
            where: {
              id: { in: [...allWorkerIds] },
              ...(locationId ? { inventoryLocationId: locationId } : {}),
            },
            select: { id: true, displayName: true, workArea: true },
          })
        : Promise.resolve([] as { id: string; displayName: string; workArea: string }[]),
    ]);

    const productMeta = new Map(
      (
        existingProducts as {
          id: string;
          minimumQuantity: number;
          placements?: { minimumQuantity: number }[];
        }[]
      ).map((p) => {
        const placementMin = p.placements?.[0]?.minimumQuantity;
        return [
          p.id,
          resolveLocationMinimum(
            placementMin != null ? placementMin : null,
            p.minimumQuantity,
          ),
        ] as const;
      }),
    );
    const countsByProduct = new Map<string, CountQtyRow[]>();
    for (const c of prevCounts) {
      const list = countsByProduct.get(c.inventoryProductId) ?? [];
      list.push(c);
      countsByProduct.set(c.inventoryProductId, list);
    }
    const workerSnap = new Map(
      (workers as { id: string; displayName: string; workArea: string }[]).map((w) => [
        w.id,
        { displayName: w.displayName, workArea: w.workArea },
      ]),
    );

    const prepared: PreparedLine[] = [];
    for (const line of body.lines) {
      const pid = (line.inventoryProductId ?? line.productId)?.trim();
      if (!pid || !productMeta.has(pid)) continue;

      const workerLines: PreparedWorker[] = Array.isArray(line.workers)
        ? line.workers
            .map((w) => {
              const wid = w.inventoryLocationWorkerId?.trim();
              const qty = Number(w.countedQuantity);
              if (!wid || !Number.isFinite(qty) || qty < 0) return null;
              const snap = workerSnap.get(wid);
              if (!snap) return null;
              return {
                inventoryLocationWorkerId: wid,
                countedQuantity: qty,
                workerDisplayName: snap.displayName,
                workerWorkArea: snap.workArea,
              };
            })
            .filter((w): w is PreparedWorker => !!w)
        : [];

      let currentQuantity: number;
      if (workerLines.length > 0) {
        currentQuantity = workerLines.reduce((sum, w) => sum + w.countedQuantity, 0);
      } else {
        currentQuantity = Number(line.currentQuantity ?? line.countedQuantity ?? line.actualQty);
      }
      if (!Number.isFinite(currentQuantity) || currentQuantity < 0) continue;

      const previousQuantity = previousQtyFromCounts(countsByProduct.get(pid) ?? [], locationId);
      const difference = currentQuantity - previousQuantity;
      const noteText = line.note?.trim() ?? line.notes?.trim() ?? "";
      const fallbackMin = productMeta.get(pid) ?? 0;
      const rawMin = line.minimumQuantity;
      const minimumQuantity =
        rawMin != null && Number.isFinite(Number(rawMin))
          ? Math.max(0, Number(rawMin))
          : Math.max(0, fallbackMin);
      prepared.push({
        inventoryProductId: pid,
        previousQuantity,
        currentQuantity,
        difference,
        minimumQuantity,
        note: noteText || null,
        workers: workerLines,
      });
    }

    // שורת מוצר אחת לסשן — כפילות ב־body: האחרונה מנצחת
    const preparedByProduct = new Map<string, PreparedLine>();
    for (const row of prepared) {
      preparedByProduct.set(row.inventoryProductId, row);
    }

    /**
     * הגנה: לקוח מיושן (טאב שנשאר פתוח) לא יכול לשמור מוצר שהוסר מהסבב.
     * ההסרה נאכפת בשרת ולא רק ב־UI.
     */
    if (shelf) {
      const scope = resolveCountRoundScope(shelf, body.countDate ?? body.countedAt);
      for (const productId of await loadExcludedProductIds(scope)) {
        preparedByProduct.delete(productId);
      }
    }

    const uniquePrepared = [...preparedByProduct.values()];

    if (uniquePrepared.length === 0) {
      return NextResponse.json(
        { ok: false, error: "לא נשמרו שורות — בדקו מזהי מוצר" },
        { status: 400 },
      );
    }

    const created = await prismaAny.$transaction(async (tx: typeof prismaAny) => {
      const countSession = await tx.inventoryCountSession.create({
        data: {
          locationId,
          locationName,
          countDate,
          startedAt,
          countedByUserId: session.sub,
          status: "COMPLETED",
          productCount: uniquePrepared.length,
          shortageCount: uniquePrepared.filter((p) => p.difference < 0).length,
          surplusCount: uniquePrepared.filter((p) => p.difference > 0).length,
          matchCount: uniquePrepared.filter((p) => p.difference === 0).length,
          totalCountedQty: uniquePrepared.reduce((s, p) => s + p.currentQuantity, 0),
        },
        select: { id: true, sessionNumber: true },
      });

      await tx.inventoryCount.createMany({
        data: uniquePrepared.map((p) => ({
          inventoryProductId: p.inventoryProductId,
          locationId,
          sessionId: countSession.id,
          countDate,
          previousQuantity: p.previousQuantity,
          currentQuantity: p.currentQuantity,
          minimumQuantity: p.minimumQuantity,
          difference: p.difference,
          note: p.note,
          countedByUserId: session.sub,
        })),
      });

      /** מעדכן מינימום "אחרון" למיקום — לספירה הבאה / מסכים אחרים; לא נוגע בספירות ישנות */
      if (locationId) {
        for (const p of uniquePrepared) {
          await tx.inventoryProductOnLocation.updateMany({
            where: { locationId, inventoryProductId: p.inventoryProductId },
            data: { minimumQuantity: p.minimumQuantity },
          });
        }
      }

      const createdCounts = (await tx.inventoryCount.findMany({
        where: { sessionId: countSession.id },
        select: { id: true, inventoryProductId: true },
      })) as { id: string; inventoryProductId: string }[];

      const countIdByProduct = new Map(
        createdCounts.map((c) => [c.inventoryProductId, c.id]),
      );

      const workerRows: {
        inventoryCountId: string;
        inventoryLocationWorkerId: string;
        countedQuantity: number;
        workerDisplayName: string;
        workerWorkArea: string;
      }[] = [];
      for (const p of uniquePrepared) {
        const countId = countIdByProduct.get(p.inventoryProductId);
        if (!countId) continue;
        for (const w of p.workers) {
          workerRows.push({
            inventoryCountId: countId,
            inventoryLocationWorkerId: w.inventoryLocationWorkerId,
            countedQuantity: w.countedQuantity,
            workerDisplayName: w.workerDisplayName,
            workerWorkArea: w.workerWorkArea,
          });
        }
      }
      if (workerRows.length > 0) {
        await tx.inventoryCountWorker.createMany({ data: workerRows });
      }

      return {
        sessionId: countSession.id,
        sessionNumber: countSession.sessionNumber,
        rows: uniquePrepared.map((p) => {
          const prevCountsForProduct = countsByProduct.get(p.inventoryProductId) ?? [];
          // מחליפים את הספירה האחרונה של המיקום הנוכחי — בלי לגעת בהיסטוריה ב-DB
          const nextCounts = prevCountsForProduct
            .filter((c) => c.locationId !== locationId)
            .map((c) => ({ locationId: c.locationId, currentQuantity: c.currentQuantity }));
          nextCounts.push({ locationId, currentQuantity: p.currentQuantity });
          const businessTotal = systemTotalFromCounts(nextCounts);
          const required = requiredQtyToMinimum(p.currentQuantity, p.minimumQuantity);
          return {
            id: countIdByProduct.get(p.inventoryProductId) ?? "",
            inventoryProductId: p.inventoryProductId,
            previousQuantity: p.currentQuantity,
            currentQuantity: p.currentQuantity,
            difference: p.difference,
            locationId,
            locationQuantity: p.currentQuantity,
            systemTotalQuantity: p.currentQuantity,
            businessTotalQuantity: businessTotal,
            systemShortage: required,
            requiredQuantity: required,
            minimumQuantity: p.minimumQuantity,
            workers: p.workers,
          };
        }),
      };
    });

    // התראת סיום ספירה לנמעני המערכת — ברקע, כדי לא לעכב את סיום השמירה
    scheduleCountSessionCompletedAlert(created.sessionId);

    return NextResponse.json({
      ok: true,
      data: {
        saved: created.rows.length,
        sessionId: created.sessionId,
        sessionNumber: created.sessionNumber,
        rows: created.rows,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
