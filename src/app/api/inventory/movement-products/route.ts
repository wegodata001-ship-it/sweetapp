import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import type { Prisma } from "@prisma/client";

/** חיפוש מוצרי מכירה לתנועות יומיות — לא מוצרי ספירת מלאי */
export async function GET(req: NextRequest) {
  const block = await requireDb();
  if (block) return block;
  try {
    const { searchParams } = req.nextUrl;
    const q = searchParams.get("q")?.trim() ?? "";
    const limitRaw = searchParams.get("limit");
    const limit = Math.min(24, Math.max(1, parseInt(limitRaw ?? "12", 10) || 12));

    const where: Prisma.ProductWhereInput = {};
    if (q) {
      where.name = { contains: q, mode: "insensitive" };
    }

    const rows = await prisma.product.findMany({
      where,
      select: { id: true, name: true, currentStock: true },
      orderBy: { name: "asc" },
      take: limit,
    });

    return NextResponse.json({ ok: true, data: rows });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
