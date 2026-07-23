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
  // ספירת מדף צריכה רשימה מלאה
  const pageSizeRaw = parseInt(searchParams.get("pageSize") || "120", 10);
  const pageSize = Math.min(1000, Math.max(5, Number.isFinite(pageSizeRaw) ? pageSizeRaw : 120));

  if (!locationEq && !locationIdParam) {
    return NextResponse.json({
      ok: true,
      data: [],
      meta: { total: 0, page, pageSize, stock, needsLocation: true },
    });
  }

  try {
    // 1) Location + workers — round-trip יחיד
    const shelf = await resolveShelfWithWorkers(locationIdParam ?? null, locationEq);
    if (!shelf) {
      return NextResponse.json({
        ok: true,
        data: [],
        meta: { total: 0, page, pageSize, stock, needsLocation: true },
      });
    }

    const where: Record<string, unknown> = {
      AND: [
        productsOnShelfWhere(shelf),
        ...(q ? [{ name: { contains: q, mode: "insensitive" as const } }] : []),
        ...(category ? [{ category }] : []),
      ],
    };

    // 2) Products — ללא N+1
    const products = await prismaAny.inventoryProduct.findMany({
      where,
      orderBy: [{ name: "asc" }],
      select: {
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
      },
    });

    // 3) Latest count לכל (product, location) — query אחד, ללא N+1
    const productIds = products.map((p: { id: string }) => p.id);
    const latestCounts =
      productIds.length === 0
        ? []
        : ((await prismaAny.inventoryCount.findMany({
            where: { inventoryProductId: { in: productIds } },
            orderBy: { countDate: "desc" },
            distinct: ["inventoryProductId", "locationId"],
            select: {
              inventoryProductId: true,
              locationId: true,
              currentQuantity: true,
              countDate: true,
            },
          })) as {
            inventoryProductId: string;
            locationId: string | null;
            currentQuantity: number;
            countDate: Date;
          }[]);

    const countsByProduct = new Map<
      string,
      { locationId: string | null; currentQuantity: number; countDate: Date }[]
    >();
    for (const c of latestCounts) {
      const list = countsByProduct.get(c.inventoryProductId) ?? [];
      list.push(c);
      countsByProduct.set(c.inventoryProductId, list);
    }

    type MonthlyMapped = {
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
      previousQuantity: number;
      systemTotalQuantity: number;
      systemShortage: number;
      minimumQuantity: number;
      maximumQuantity: number | null;
      lastCountedAt: string | null;
      stockTier: ReturnType<typeof classifyStockTier>;
    };

    const mapped: MonthlyMapped[] = products.map(
      (p: {
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
      }) => {
        const counts = countsByProduct.get(p.id) ?? [];
        const locationName = shelf.name || p.inventoryLocation?.name || p.location || "";
        const latestForShelf =
          (shelf.id
            ? counts.find((c) => c.locationId === shelf.id)
            : null) ??
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
      },
    );

    const filtered =
      stock === "all"
        ? mapped
        : mapped.filter((m) => matchesStockFilter(m.stockTier, stock));

    const total = filtered.length;
    const start = (page - 1) * pageSize;
    const paged = filtered
      .slice(start, start + pageSize)
      .map(({ stockTier: _s, ...rest }) => rest);

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
        /** פירוט לפי עובד מיקום — סה״כ = סכום הכמויות */
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

    const created = await prismaAny.$transaction(async (tx: typeof prismaAny) => {
      const out: {
        id: string;
        inventoryProductId: string;
        previousQuantity: number;
        currentQuantity: number;
        difference: number;
        locationId: string | null;
        workers: { inventoryLocationWorkerId: string; countedQuantity: number }[];
      }[] = [];
      for (const line of body.lines) {
        const pid = (line.inventoryProductId ?? line.productId)?.trim();
        if (!pid) continue;

        const workerLines = Array.isArray(line.workers)
          ? line.workers
              .map((w) => {
                const wid = w.inventoryLocationWorkerId?.trim();
                const qty = Number(w.countedQuantity);
                if (!wid || !Number.isFinite(qty) || qty < 0) return null;
                return { inventoryLocationWorkerId: wid, countedQuantity: qty };
              })
              .filter((w): w is { inventoryLocationWorkerId: string; countedQuantity: number } => !!w)
          : [];

        let currentQuantity: number;
        if (workerLines.length > 0) {
          currentQuantity = workerLines.reduce((sum, w) => sum + w.countedQuantity, 0);
        } else {
          currentQuantity = Number(
            line.currentQuantity ?? line.countedQuantity ?? line.actualQty,
          );
        }
        if (!Number.isFinite(currentQuantity) || currentQuantity < 0) continue;

        const product = await tx.inventoryProduct.findFirst({
          where: { id: pid },
          select: { id: true },
        });
        if (!product) continue;

        if (workerLines.length > 0 && locationId) {
          const workerIds = workerLines.map((w) => w.inventoryLocationWorkerId);
          const valid = await tx.inventoryLocationWorker.findMany({
            where: {
              id: { in: workerIds },
              inventoryLocationId: locationId,
            },
            select: { id: true },
          });
          if (valid.length !== workerIds.length) {
            throw new Error("עובד מיקום לא שייך למיקום הספירה");
          }
        }

        const previousForLoc = locationId
          ? (
              await tx.inventoryCount.findFirst({
                where: { inventoryProductId: pid, locationId },
                orderBy: { countDate: "desc" },
                select: { currentQuantity: true },
              })
            )?.currentQuantity ??
            (
              await tx.inventoryCount.findFirst({
                where: { inventoryProductId: pid, locationId: null },
                orderBy: { countDate: "desc" },
                select: { currentQuantity: true },
              })
            )?.currentQuantity ??
            0
          : (
              await tx.inventoryCount.findFirst({
                where: { inventoryProductId: pid },
                orderBy: { countDate: "desc" },
                select: { currentQuantity: true },
              })
            )?.currentQuantity ?? 0;

        const previousQuantity = previousForLoc;
        const difference = currentQuantity - previousQuantity;
        const noteText = line.note?.trim() ?? line.notes?.trim() ?? "";
        const row = await tx.inventoryCount.create({
          data: {
            inventoryProductId: pid,
            locationId,
            countDate,
            previousQuantity,
            currentQuantity,
            difference,
            note: noteText || null,
            countedByUserId: session.sub,
            ...(workerLines.length > 0
              ? {
                  workerLines: {
                    create: workerLines.map((w) => ({
                      inventoryLocationWorkerId: w.inventoryLocationWorkerId,
                      countedQuantity: w.countedQuantity,
                    })),
                  },
                }
              : {}),
          },
        });
        out.push({
          id: row.id,
          inventoryProductId: pid,
          previousQuantity,
          currentQuantity,
          difference,
          locationId,
          workers: workerLines,
        });
      }
      return out;
    });

    if (created.length === 0) {
      return NextResponse.json(
        { ok: false, error: "לא נשמרו שורות — בדקו מזהי מוצר" },
        { status: 400 },
      );
    }

    return NextResponse.json({
      ok: true,
      data: { saved: created.length, rows: created },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
