import { NextRequest, NextResponse } from "next/server";
import { prismaAny } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import {
  buildInventoryProductBaseWhere,
  classifyStockTier,
  clampPage,
  clampPageSize,
  matchesStockFilter,
  type InventoryListQuery,
  type StockFilterTier,
} from "@/lib/inventory/product-filters";

export async function GET(req: NextRequest) {
  const block = await requireDb();
  if (block) return block;
  const { searchParams } = req.nextUrl;

  const locationEq = searchParams.get("location")?.trim() || undefined;

  const listQuery: InventoryListQuery = {
    locationEquals: locationEq,
    q: searchParams.get("q")?.trim() || undefined,
    category: searchParams.get("category")?.trim() || undefined,
    stock: (searchParams.get("stock") as StockFilterTier) || "all",
    page: clampPage(parseInt(searchParams.get("page") || "1", 10)),
    pageSize: clampPageSize(parseInt(searchParams.get("pageSize") || "120", 10)),
  };

  if (!locationEq) {
    const page = listQuery.page ?? 1;
    const pageSize = listQuery.pageSize ?? 120;
    const stock = listQuery.stock ?? "all";
    return NextResponse.json({
      ok: true,
      data: [],
      meta: { total: 0, page, pageSize, stock, needsLocation: true },
    });
  }

  const baseWhere = buildInventoryProductBaseWhere(listQuery, null, {
    excludeUntaggedInZone: false,
  });

  try {
    const products = await prismaAny.inventoryProduct.findMany({
      where: baseWhere,
      orderBy: [{ name: "asc" }],
      select: {
        id: true,
        name: true,
        location: true,
        locationId: true,
        unit: true,
        minimumQuantity: true,
        inventoryLocation: { select: { name: true } },
        counts: {
          orderBy: { countDate: "desc" },
          take: 1,
          select: {
            currentQuantity: true,
            countDate: true,
          },
        },
      },
    });

    type MonthlyMapped = {
      id: string;
      name: string;
      location: string;
      locationId: string | null;
      unit: string | null;
      previousQuantity: number;
      lastCountedAt: string | null;
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
        inventoryLocation?: { name: string } | null;
        counts: { currentQuantity: number; countDate: Date }[];
      }) => {
        const locationName = p.inventoryLocation?.name ?? p.location ?? "";
        const latestQty = p.counts[0]?.currentQuantity ?? null;
        const tier = classifyStockTier(latestQty, p.minimumQuantity);
        return {
          id: p.id,
          name: p.name,
          location: locationName,
          locationId: p.locationId,
          unit: p.unit,
          previousQuantity: latestQty ?? 0,
          lastCountedAt: p.counts[0]?.countDate ? new Date(p.counts[0].countDate).toISOString() : null,
          stockTier: tier,
        };
      },
    );

    const stock = listQuery.stock ?? "all";
    const filtered =
      stock === "all" ? mapped : mapped.filter((m: MonthlyMapped) => matchesStockFilter(m.stockTier, stock));

    const total = filtered.length;
    const page = listQuery.page ?? 1;
    const pageSize = listQuery.pageSize ?? 120;
    const start = (page - 1) * pageSize;
    const paged = filtered
      .slice(start, start + pageSize)
      .map(({ stockTier: _s, ...rest }: MonthlyMapped) => rest);

    return NextResponse.json({
      ok: true,
      data: paged,
      meta: { total, page, pageSize, stock },
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

    const created = await prismaAny.$transaction(async (tx: typeof prismaAny) => {
      const out: {
        id: string;
        inventoryProductId: string;
        previousQuantity: number;
        currentQuantity: number;
        difference: number;
      }[] = [];
      for (const line of body.lines) {
        const pid = (line.inventoryProductId ?? line.productId)?.trim();
        if (!pid) continue;
        const currentQuantity = Number(line.currentQuantity ?? line.countedQuantity ?? line.actualQty);
        if (!Number.isFinite(currentQuantity)) continue;

        const product = await tx.inventoryProduct.findFirst({
          where: { id: pid },
          select: { id: true },
        });
        if (!product) continue;

        const previous = await tx.inventoryCount.findFirst({
          where: { inventoryProductId: pid },
          orderBy: { countDate: "desc" },
          select: { currentQuantity: true },
        });
        const previousQuantity = previous?.currentQuantity ?? 0;
        const difference = currentQuantity - previousQuantity;
        const noteText = line.note?.trim() ?? line.notes?.trim() ?? "";
        const row = await tx.inventoryCount.create({
          data: {
            inventoryProductId: pid,
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
        });
      }
      return out;
    });

    if (created.length === 0) {
      return NextResponse.json({ ok: false, error: "לא נשמרו שורות — בדקו מזהי מוצר" }, { status: 400 });
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
