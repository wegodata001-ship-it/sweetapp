import { NextRequest, NextResponse } from "next/server";
import { prismaAny } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import {
  classifyStockTier,
  clampPage,
  clampPageSize,
  matchesStockFilter,
  type StockFilterTier,
} from "@/lib/inventory/product-filters";
import {
  productsOnShelfWhere,
  resolveShelf,
  resolveShelfWithWorkers,
} from "@/lib/inventory/shelf-service";

/** סה״כ מערכת ממערך ספירות שכבר נטען (ללא N+1) */
function systemTotalFromCounts(
  counts: { locationId: string | null; currentQuantity: number }[],
): number {
  const seen = new Set<string>();
  let total = 0;
  for (const c of counts) {
    const key = c.locationId ?? "__legacy__";
    if (seen.has(key)) continue;
    seen.add(key);
    total += Number(c.currentQuantity || 0);
  }
  return total;
}

function previousQtyFromCounts(
  counts: { locationId: string | null; currentQuantity: number }[],
  locationId: string | null,
): number {
  if (locationId) {
    return (
      counts.find((c) => c.locationId === locationId)?.currentQuantity ??
      counts.find((c) => !c.locationId)?.currentQuantity ??
      0
    );
  }
  return counts[0]?.currentQuantity ?? 0;
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
  inventoryLocation?: { name: string } | null;
};

type CountQtyRow = {
  inventoryProductId: string;
  locationId: string | null;
  currentQuantity: number;
  countDate: Date;
};

async function loadLatestCountsForProducts(productIds: string[]): Promise<Map<string, CountQtyRow[]>> {
  const countsByProduct = new Map<string, CountQtyRow[]>();
  if (productIds.length === 0) return countsByProduct;
  const latestCounts = (await prismaAny.inventoryCount.findMany({
    where: { inventoryProductId: { in: productIds } },
    orderBy: { countDate: "desc" },
    distinct: ["inventoryProductId", "locationId"],
    select: {
      inventoryProductId: true,
      locationId: true,
      currentQuantity: true,
      countDate: true,
    },
  })) as CountQtyRow[];
  for (const c of latestCounts) {
    const list = countsByProduct.get(c.inventoryProductId) ?? [];
    list.push(c);
    countsByProduct.set(c.inventoryProductId, list);
  }
  return countsByProduct;
}

function mapProductRow(
  p: ProductRow,
  shelf: { id: string | null; name: string },
  countsByProduct: Map<string, CountQtyRow[]>,
) {
  const counts = countsByProduct.get(p.id) ?? [];
  const locationName = shelf.name || p.inventoryLocation?.name || p.location || "";
  const latestForShelf =
    (shelf.id ? counts.find((c) => c.locationId === shelf.id) : null) ??
    counts.find((c) => !c.locationId) ??
    null;
  const locationQty = latestForShelf?.currentQuantity ?? 0;
  const systemTotal = systemTotalFromCounts(counts);
  const systemShortage =
    p.minimumQuantity > 0 ? Math.max(0, p.minimumQuantity - systemTotal) : 0;
  const tier = classifyStockTier(locationQty, p.minimumQuantity);
  return {
    id: p.id,
    name: p.nameHe?.trim() || p.name,
    nameHe: p.nameHe,
    nameAr: p.nameAr,
    nameEn: p.nameEn,
    barcode: p.barcode,
    sku: p.sku,
    location: locationName,
    locationId: shelf.id,
    unit: p.unit,
    previousQuantity: locationQty,
    systemTotalQuantity: systemTotal,
    systemShortage,
    minimumQuantity: p.minimumQuantity,
    maximumQuantity: p.maximumQuantity,
    lastCountedAt: latestForShelf?.countDate
      ? new Date(latestForShelf.countDate).toISOString()
      : null,
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
    const shelf = await resolveShelfWithWorkers(locationIdParam ?? null, locationEq);
    if (!shelf) {
      return NextResponse.json({
        ok: true,
        data: [],
        meta: { total: 0, page, pageSize, stock, needsLocation: true, hasMore: false },
      });
    }

    const where: Record<string, unknown> = {
      AND: [
        productsOnShelfWhere(shelf),
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

    // סינון מלאי דורש כמויות — נתיב איטי יותר (תואם לאחור). מסך הספירה משתמש ב־stock=all.
    if (stock !== "all") {
      const products = (await prismaAny.inventoryProduct.findMany({
        where,
        orderBy: [{ name: "asc" }],
        select: PRODUCT_SELECT,
      })) as ProductRow[];
      const countsByProduct = await loadLatestCountsForProducts(products.map((p) => p.id));
      const mapped = products.map((p) => mapProductRow(p, shelf, countsByProduct));
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
        },
      });
    }

    // נתיב מהיר: count + skip/take ב־DB, counts רק לעמוד הנוכחי
    const [total, products] = await Promise.all([
      prismaAny.inventoryProduct.count({ where }),
      prismaAny.inventoryProduct.findMany({
        where,
        orderBy: [{ name: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: PRODUCT_SELECT,
      }),
    ]);

    const countsByProduct = await loadLatestCountsForProducts(
      (products as ProductRow[]).map((p) => p.id),
    );
    const paged = (products as ProductRow[]).map((p) => {
      const { stockTier: _s, ...rest } = mapProductRow(p, shelf, countsByProduct);
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
    const body = (await req.json()) as {
      countDate?: string | null;
      countedAt?: string | null;
      locationId?: string | null;
      location?: string | null;
      lines: {
        inventoryProductId?: string;
        productId?: string;
        currentQuantity?: number;
        countedQuantity?: number;
        actualQty?: number;
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
    const countDate = rawDate ? new Date(rawDate) : new Date();
    if (Number.isNaN(countDate.getTime())) {
      return NextResponse.json({ ok: false, error: "תאריך ספירה לא תקין" }, { status: 400 });
    }

    const shelf = await resolveShelf(body.locationId?.trim() ?? null, body.location?.trim());
    const locationId = shelf?.id ?? null;
    const locationName = shelf?.name ?? body.location?.trim() ?? "";

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
        select: { id: true },
      }),
      rawPids.length === 0
        ? Promise.resolve([] as CountQtyRow[])
        : (prismaAny.inventoryCount.findMany({
            where: { inventoryProductId: { in: rawPids } },
            orderBy: { countDate: "desc" },
            distinct: ["inventoryProductId", "locationId"],
            select: {
              inventoryProductId: true,
              locationId: true,
              currentQuantity: true,
              countDate: true,
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

    const productOk = new Set((existingProducts as { id: string }[]).map((p) => p.id));
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
      if (!pid || !productOk.has(pid)) continue;

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
      prepared.push({
        inventoryProductId: pid,
        previousQuantity,
        currentQuantity,
        difference,
        note: noteText || null,
        workers: workerLines,
      });
    }

    // שורת מוצר אחת לסשן — כפילות ב־body: האחרונה מנצחת
    const preparedByProduct = new Map<string, PreparedLine>();
    for (const row of prepared) {
      preparedByProduct.set(row.inventoryProductId, row);
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
          difference: p.difference,
          note: p.note,
          countedByUserId: session.sub,
        })),
      });

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
        rows: uniquePrepared.map((p) => ({
          id: countIdByProduct.get(p.inventoryProductId) ?? "",
          inventoryProductId: p.inventoryProductId,
          previousQuantity: p.previousQuantity,
          currentQuantity: p.currentQuantity,
          difference: p.difference,
          locationId,
          workers: p.workers,
        })),
      };
    });

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
