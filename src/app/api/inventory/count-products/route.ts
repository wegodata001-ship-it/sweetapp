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

function mapProduct(row: {
  id: string;
  name: string;
  location: string;
  locationId: string | null;
  category: string;
  minimumQuantity: number;
  unit: string | null;
  createdAt: Date;
  inventoryLocation?: { id: string; name: string } | null;
  _count: { counts: number };
  counts?: { currentQuantity: number }[];
}) {
  const locationName = row.inventoryLocation?.name ?? row.location ?? "";
  const latestQty = row.counts?.[0]?.currentQuantity ?? null;
  const tier = classifyStockTier(latestQty, row.minimumQuantity);
  return {
    id: row.id,
    name: row.name,
    location: locationName,
    locationId: row.locationId,
    locationName,
    category: row.category,
    minimumQuantity: row.minimumQuantity,
    unit: row.unit,
    countsCount: row._count.counts,
    createdAt: row.createdAt.toISOString(),
    latestQuantity: latestQty,
    stockTier: tier,
  };
}

export async function GET(req: NextRequest) {
  const block = await requireDb();
  if (block) return block;
  const { searchParams } = req.nextUrl;

  const listQuery: InventoryListQuery = {
    locationId: searchParams.get("locationId")?.trim() || undefined,
    locationEquals: searchParams.get("location")?.trim() || undefined,
    q: searchParams.get("q")?.trim() || undefined,
    category: searchParams.get("category")?.trim() || undefined,
    stock: (searchParams.get("stock") as StockFilterTier) || "all",
    page: clampPage(parseInt(searchParams.get("page") || "1", 10)),
    pageSize: clampPageSize(parseInt(searchParams.get("pageSize") || "80", 10)),
  };

  let locationNameLegacy: string | null = null;
  const lid = listQuery.locationId?.trim();
  if (lid && lid !== "__none__" && !listQuery.locationEquals?.trim()) {
    const loc = await prismaAny.inventoryLocation.findUnique({
      where: { id: lid },
      select: { name: true },
    });
    locationNameLegacy = loc?.name ?? null;
  }

  const excludeZone = Boolean((lid && lid !== "__none__") || listQuery.locationEquals?.trim());
  const baseWhere = buildInventoryProductBaseWhere(listQuery, locationNameLegacy, {
    excludeUntaggedInZone: excludeZone && !listQuery.locationEquals?.trim(),
  });

  try {
    const rows = await prismaAny.inventoryProduct.findMany({
      where: baseWhere,
      orderBy: [{ name: "asc" }],
      select: {
        id: true,
        name: true,
        location: true,
        locationId: true,
        category: true,
        minimumQuantity: true,
        unit: true,
        createdAt: true,
        inventoryLocation: { select: { id: true, name: true } },
        _count: { select: { counts: true } },
        counts: {
          orderBy: { countDate: "desc" },
          take: 1,
          select: { currentQuantity: true },
        },
      },
    });

    type CountMapped = ReturnType<typeof mapProduct>;
    const mapped: CountMapped[] = rows.map((row: Parameters<typeof mapProduct>[0]) => mapProduct(row));
    const stock = listQuery.stock ?? "all";
    const filtered =
      stock === "all" ? mapped : mapped.filter((m: CountMapped) => matchesStockFilter(m.stockTier, stock));

    const total = filtered.length;
    const page = listQuery.page ?? 1;
    const pageSize = listQuery.pageSize ?? 80;
    const start = (page - 1) * pageSize;
    const paged = filtered.slice(start, start + pageSize);

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
      name?: string;
      locationId?: string | null;
      location?: string | null;
      unit?: string | null;
      category?: string | null;
      minimumQuantity?: number;
    };
    const name = body.name?.trim();
    if (!name) return NextResponse.json({ ok: false, error: "חסר שם פריט" }, { status: 400 });

    let locationId: string | null = body.locationId?.trim() || null;
    let locationText = "";

    if (locationId) {
      const loc = await prismaAny.inventoryLocation.findFirst({
        where: { id: locationId, isActive: true },
        select: { id: true, name: true },
      });
      if (!loc) {
        return NextResponse.json({ ok: false, error: "מיקום לא נמצא או לא פעיל" }, { status: 400 });
      }
      locationText = loc.name;
    } else {
      const legacy = body.location?.trim();
      if (!legacy) {
        return NextResponse.json(
          { ok: false, error: "נדרש לבחור מיקום מהרשימה (מומלץ) או לציין מיקום טקסטואלי" },
          { status: 400 },
        );
      }
      locationText = legacy;
    }

    const category = body.category?.trim() || "כללי";
    let minimumQuantity = 0;
    if (body.minimumQuantity !== undefined) {
      const n = Number(body.minimumQuantity);
      if (!Number.isFinite(n) || n < 0) {
        return NextResponse.json({ ok: false, error: "מינימום לא תקין" }, { status: 400 });
      }
      minimumQuantity = n;
    }

    const row = await prismaAny.inventoryProduct.create({
      data: {
        name,
        location: locationText,
        locationId,
        category,
        minimumQuantity,
        unit: body.unit?.trim() || null,
      },
    });
    return NextResponse.json({ ok: true, data: row });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
