import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";

const DEVIATION_PCT = 15;

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const block = await requireDb();
  if (block) return block;
  const { id: supplierId } = await ctx.params;
  try {
    const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
    const minPrice = req.nextUrl.searchParams.get("minPrice");
    const maxPrice = req.nextUrl.searchParams.get("maxPrice");
    const onlyDeviations = req.nextUrl.searchParams.get("onlyDeviations") === "1";

    const minN = minPrice != null && minPrice !== "" ? Number(minPrice) : null;
    const maxN = maxPrice != null && maxPrice !== "" ? Number(maxPrice) : null;

    const regularFilter: { gte?: number; lte?: number } = {};
    if (minN !== null && Number.isFinite(minN)) regularFilter.gte = minN;
    if (maxN !== null && Number.isFinite(maxN)) regularFilter.lte = maxN;

    const rows = await prisma.supplierProduct.findMany({
      where: {
        supplierId,
        ...(q ? { productName: { contains: q, mode: "insensitive" as const } } : {}),
        ...(Object.keys(regularFilter).length > 0 ? { regularPrice: regularFilter } : {}),
      },
      orderBy: { productName: "asc" },
      include: {
        priceHistory: { orderBy: { recordedAt: "desc" }, take: 1, select: { price: true, recordedAt: true } },
      },
    });

    const mapped = rows.map((r) => {
      const regular = r.regularPrice;
      const last = r.priceHistory[0]?.price ?? regular;
      const changePct = regular > 1e-9 ? ((last - regular) / regular) * 100 : 0;
      const deviation = Math.abs(changePct) >= DEVIATION_PCT - 1e-9;
      return {
        id: r.id,
        productName: r.productName,
        regularPrice: regular,
        unit: r.unit,
        notes: r.notes,
        updatedAt: r.updatedAt.toISOString(),
        lastPrice: last,
        lastRecordedAt: r.priceHistory[0]?.recordedAt?.toISOString() ?? null,
        changePct,
        deviation,
      };
    });

    const data = onlyDeviations ? mapped.filter((m) => m.deviation) : mapped;

    return NextResponse.json({ ok: true, data });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const block = await requireDb();
  if (block) return block;
  const { id: supplierId } = await ctx.params;
  try {
    const body = (await req.json()) as {
      productName: string;
      regularPrice: number;
      unit?: string | null;
      notes?: string | null;
    };
    if (!body.productName?.trim()) {
      return NextResponse.json({ ok: false, error: "חסר שם מוצר" }, { status: 400 });
    }
    const regularPrice = Number(body.regularPrice);
    if (!Number.isFinite(regularPrice) || regularPrice < 0) {
      return NextResponse.json({ ok: false, error: "מחיר לא תקין" }, { status: 400 });
    }

    const p = await prisma.supplierProduct.create({
      data: {
        supplierId,
        productName: body.productName.trim(),
        regularPrice,
        unit: body.unit?.trim() || null,
        notes: body.notes?.trim() || null,
      },
    });
    await prisma.supplierProductPriceHistory.create({
      data: { supplierProductId: p.id, price: regularPrice, source: "manual" },
    });

    return NextResponse.json({ ok: true, data: p });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
