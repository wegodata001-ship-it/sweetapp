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
import { productsOnShelfWhere, resolveShelf } from "@/lib/inventory/shelf-service";

/** סה״כ מערכת = סכום הכמויות האחרונות לכל מיקום של המוצר */
async function systemTotalsForProducts(
  productIds: string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (!productIds.length) return map;

  const counts = await prismaAny.inventoryCount.findMany({
    where: { inventoryProductId: { in: productIds } },
    orderBy: { countDate: "desc" },
    select: {
      inventoryProductId: true,
      locationId: true,
      currentQuantity: true,
    },
  });

  // לכל (product, location) — הכמות האחרונה בלבד; locationId null = bucket legacy אחד
  const seen = new Set<string>();
  for (const c of counts) {
    const key = `${c.inventoryProductId}::${c.locationId ?? "__legacy__"}`;
    if (seen.has(key)) continue;
    seen.add(key);
    map.set(
      c.inventoryProductId,
      (map.get(c.inventoryProductId) ?? 0) + Number(c.currentQuantity || 0),
    );
  }
  return map;
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
    const shelf = await resolveShelf(locationIdParam ?? null, locationEq);
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

    const products = await prismaAny.inventoryProduct.findMany({
      where,
      orderBy: [{ name: "asc" }],
      select: {
        id: true,
        name: true,
        location: true,
        locationId: true,
        unit: true,
        minimumQuantity: true,
        worker1Name: true,
        worker1Location: true,
        worker2Name: true,
        worker2Location: true,
        worker3Name: true,
        worker3Location: true,
        inventoryLocation: { select: { name: true } },
        counts: {
          where: shelf.id
            ? { OR: [{ locationId: shelf.id }, { locationId: null }] }
            : undefined,
          orderBy: { countDate: "desc" },
          take: 10,
          select: {
            currentQuantity: true,
            countDate: true,
            locationId: true,
          },
        },
      },
    });

    const totals = await systemTotalsForProducts(products.map((p: { id: string }) => p.id));

    type MonthlyMapped = {
      id: string;
      name: string;
      location: string;
      locationId: string | null;
      unit: string | null;
      previousQuantity: number;
      systemTotalQuantity: number;
      systemShortage: number;
      minimumQuantity: number;
      lastCountedAt: string | null;
      worker1Name: string | null;
      worker1Location: string | null;
      worker2Name: string | null;
      worker2Location: string | null;
      worker3Name: string | null;
      worker3Location: string | null;
      stockTier: ReturnType<typeof classifyStockTier>;
    };

    const mapped: MonthlyMapped[] = products.map(
      (p: {
        id: string;
        name: string;
        location: string;
        locationId: string | null;
        unit: string | null;
        minimumQuantity: number;
        worker1Name: string | null;
        worker1Location: string | null;
        worker2Name: string | null;
        worker2Location: string | null;
        worker3Name: string | null;
        worker3Location: string | null;
        inventoryLocation?: { name: string } | null;
        counts: { currentQuantity: number; countDate: Date; locationId: string | null }[];
      }) => {
        const locationName = shelf.name || p.inventoryLocation?.name || p.location || "";
        const latestForShelf =
          (shelf.id
            ? p.counts.find((c) => c.locationId === shelf.id)
            : null) ??
          p.counts.find((c) => !c.locationId) ??
          null;
        const locationQty = latestForShelf?.currentQuantity ?? 0;
        const systemTotal = totals.get(p.id) ?? locationQty;
        const systemShortage =
          p.minimumQuantity > 0 ? Math.max(0, p.minimumQuantity - systemTotal) : 0;
        const tier = classifyStockTier(locationQty, p.minimumQuantity);
        return {
          id: p.id,
          name: p.name,
          location: locationName,
          locationId: shelf.id,
          unit: p.unit,
          previousQuantity: locationQty,
          systemTotalQuantity: systemTotal,
          systemShortage,
          minimumQuantity: p.minimumQuantity,
          lastCountedAt: latestForShelf?.countDate
            ? new Date(latestForShelf.countDate).toISOString()
            : null,
          worker1Name: p.worker1Name,
          worker1Location: p.worker1Location,
          worker2Name: p.worker2Name,
          worker2Location: p.worker2Location,
          worker3Name: p.worker3Name,
          worker3Location: p.worker3Location,
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
      meta: { total, page, pageSize, stock, locationId: shelf.id, locationName: shelf.name },
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
      }[] = [];
      for (const line of body.lines) {
        const pid = (line.inventoryProductId ?? line.productId)?.trim();
        if (!pid) continue;
        const currentQuantity = Number(
          line.currentQuantity ?? line.countedQuantity ?? line.actualQty,
        );
        if (!Number.isFinite(currentQuantity)) continue;

        const product = await tx.inventoryProduct.findFirst({
          where: { id: pid },
          select: { id: true },
        });
        if (!product) continue;

        // ספירה לפי מיקום — previous רק מאותו מיקום (או legacy null אם אין)
        const previous = await tx.inventoryCount.findFirst({
          where: locationId
            ? {
                inventoryProductId: pid,
                OR: [{ locationId }, { locationId: null }],
              }
            : { inventoryProductId: pid },
          orderBy: [{ locationId: "desc" }, { countDate: "desc" }],
          select: { currentQuantity: true, locationId: true },
        });
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
          : previous?.currentQuantity ?? 0;

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
          },
        });
        out.push({
          id: row.id,
          inventoryProductId: pid,
          previousQuantity,
          currentQuantity,
          difference,
          locationId,
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
