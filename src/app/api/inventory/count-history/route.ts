import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";

export async function GET(req: NextRequest) {
  const block = await requireDb();
  if (block) return block;
  try {
    const { searchParams } = req.nextUrl;
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    const productId = searchParams.get("productId")?.trim() ?? "";
    const onlyShortage = searchParams.get("onlyShortage") === "1";
    const onlySurplus = searchParams.get("onlySurplus") === "1";

    const where: Record<string, unknown> = {};
    const countDateFilter: Record<string, Date> = {};
    if (dateFrom) {
      const d = new Date(dateFrom);
      if (Number.isFinite(d.getTime())) countDateFilter.gte = d;
    }
    if (dateTo) {
      const d = new Date(dateTo);
      if (Number.isFinite(d.getTime())) {
        d.setHours(23, 59, 59, 999);
        countDateFilter.lte = d;
      }
    }
    if (Object.keys(countDateFilter).length > 0) where.countDate = countDateFilter;
    if (productId) where.inventoryProductId = productId;
    if (onlyShortage) where.difference = { lt: 0 };
    if (onlySurplus) where.difference = { gt: 0 };

    const rows = await prisma.inventoryCount.findMany({
      where,
      orderBy: { countDate: "desc" },
      take: 500,
      include: {
        countedBy: { select: { id: true, fullName: true, email: true } },
        inventoryProduct: {
          select: { id: true, name: true, location: true, unit: true },
        },
      },
    });

    return NextResponse.json({
      ok: true,
      data: rows.map((row) => ({
        id: row.id,
        countDate: row.countDate.toISOString(),
        previousQuantity: row.previousQuantity,
        currentQuantity: row.currentQuantity,
        difference: row.difference,
        note: row.note,
        countedBy: row.countedBy,
        product: row.inventoryProduct,
      })),
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
