import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import type { Prisma } from "@prisma/client";

const productStockInclude = {
  category: { select: { id: true, name: true } },
  supplier: { select: { id: true, name: true } },
  lastStockBy: { select: { id: true, fullName: true, email: true } },
} as const;

export async function GET(req: NextRequest) {
  const block = await requireDb();
  if (block) return block;
  try {
    const { searchParams } = req.nextUrl;
    const q = searchParams.get("q")?.trim() ?? "";
    const onlyShortage = searchParams.get("onlyShortage") === "1";
    const onlyBelowMin = searchParams.get("onlyBelowMin") === "1";
    const categoryId = searchParams.get("categoryId")?.trim() ?? "";
    const supplierId = searchParams.get("supplierId")?.trim() ?? "";
    const lastUpdatedById = searchParams.get("lastUpdatedById")?.trim() ?? "";
    const limitRaw = searchParams.get("limit");
    const limit = limitRaw ? Math.min(500, Math.max(1, parseInt(limitRaw, 10) || 80)) : undefined;

    const where: Prisma.ProductWhereInput = {};
    if (q) {
      where.name = { contains: q, mode: "insensitive" };
    }
    if (categoryId) where.categoryId = categoryId;
    if (supplierId) where.supplierId = supplierId;
    if (lastUpdatedById) where.lastStockById = lastUpdatedById;
    if (onlyShortage) {
      where.currentStock = { lte: 0 };
    }

    let rows = await prisma.product.findMany({
      where,
      include: productStockInclude,
      orderBy: { name: "asc" },
      take: limit,
    });

    if (onlyBelowMin) {
      rows = rows.filter(
        (p) => p.minStock > 0 && p.currentStock > 0 && p.currentStock <= p.minStock,
      );
    }

    return NextResponse.json({ ok: true, data: rows });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
