import { NextRequest, NextResponse } from "next/server";
import { prismaAny } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import {
  buildInventoryProductBaseWhere,
  classifyStockTier,
  clampPage,
  clampPageSize,
  matchesStockFilter,
  type StockFilterTier,
} from "@/lib/inventory/product-filters";

function inventoryStatus(
  current: number | null,
  minimumQuantity: number,
): "חסר" | "נמוך" | "תקין" {
  const tier = classifyStockTier(current, minimumQuantity);
  if (tier === "short") return "חסר";
  if (tier === "low") return "נמוך";
  return "תקין";
}

type StockMappedRow = {
  id: string;
  name: string;
  category: string;
  location: string;
  locationId: string | null;
  unit: string | null;
  currentQuantity: number | null;
  minimumQuantity: number;
  lastCountedAt: string | null;
  countedBy: { id: string; fullName: string; email: string } | null;
  status: "חסר" | "נמוך" | "תקין";
  stockTier: ReturnType<typeof classifyStockTier>;
};

export async function GET(req: NextRequest) {
  const block = await requireDb();
  if (block) return block;
  try {
    const { searchParams } = req.nextUrl;
    const q = searchParams.get("q")?.trim() ?? "";
    const onlyShortage = searchParams.get("onlyShortage") === "1";
    const onlyBelowMin = searchParams.get("onlyBelowMin") === "1";
    const category = searchParams.get("category")?.trim() ?? "";
    const locationId = searchParams.get("locationId")?.trim() || undefined;
    const stock = (searchParams.get("stock") as StockFilterTier) || "all";
    const page = clampPage(parseInt(searchParams.get("page") || "1", 10));
    const pageSize = clampPageSize(parseInt(searchParams.get("pageSize") || "80", 10));

    let locationNameLegacy: string | null = null;
    if (locationId && locationId !== "__none__") {
      const loc = await prismaAny.inventoryLocation.findUnique({
        where: { id: locationId },
        select: { name: true },
      });
      locationNameLegacy = loc?.name ?? null;
    }

    const baseWhere = buildInventoryProductBaseWhere(
      { locationId, q: q || undefined, category: category || undefined, stock: "all" },
      locationNameLegacy,
    );

    const rows = await prismaAny.inventoryProduct.findMany({
      where: baseWhere,
      orderBy: [{ name: "asc" }],
      include: {
        inventoryLocation: { select: { id: true, name: true } },
        counts: {
          orderBy: { countDate: "desc" },
          take: 1,
          include: {
            countedBy: { select: { id: true, fullName: true, email: true } },
          },
        },
      },
    });

    let mapped: StockMappedRow[] = rows.map(
      (p: {
        id: string;
        name: string;
        location: string;
        locationId: string | null;
        category: string;
        minimumQuantity: number;
        unit: string | null;
        inventoryLocation?: { id: string; name: string } | null;
        counts: {
          currentQuantity: number;
          countDate: Date;
          countedBy: { id: string; fullName: string; email: string } | null;
        }[];
      }) => {
        const latest = p.counts[0];
        const currentQuantity = latest ? latest.currentQuantity : null;
        const lastCountedAt = latest ? latest.countDate.toISOString() : null;
        const countedBy = latest?.countedBy ?? null;
        const minimumQuantity = p.minimumQuantity;
        const status = inventoryStatus(currentQuantity, minimumQuantity);
        const locName = p.inventoryLocation?.name ?? p.location ?? "";
        return {
          id: p.id,
          name: p.name,
          category: p.category,
          location: locName,
          locationId: p.locationId ?? p.inventoryLocation?.id ?? null,
          unit: p.unit,
          currentQuantity,
          minimumQuantity,
          lastCountedAt,
          countedBy,
          status,
          stockTier: classifyStockTier(currentQuantity, minimumQuantity),
        };
      },
    );

    if (onlyShortage) {
      mapped = mapped.filter((r: StockMappedRow) => r.status === "חסר");
    }
    if (onlyBelowMin) {
      mapped = mapped.filter((r: StockMappedRow) => r.status === "חסר" || r.status === "נמוך");
    }
    if (stock && stock !== "all") {
      mapped = mapped.filter((r: StockMappedRow) => matchesStockFilter(r.stockTier, stock));
    }

    const total = mapped.length;
    const start = (page - 1) * pageSize;
    const paged = mapped
      .slice(start, start + pageSize)
      .map(({ stockTier: _t, ...rest }: StockMappedRow) => rest);

    return NextResponse.json({ ok: true, data: paged, meta: { total, page, pageSize } });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
