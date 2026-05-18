import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string; productId: string }> }) {
  const block = await requireDb();
  if (block) return block;
  const { id: supplierId, productId } = await ctx.params;
  try {
    const prod = await prisma.supplierProduct.findFirst({
      where: { id: productId, supplierId },
      select: { id: true },
    });
    if (!prod) return NextResponse.json({ ok: false, error: "לא נמצא" }, { status: 404 });

    const rows = await prisma.supplierProductPriceHistory.findMany({
      where: { supplierProductId: productId },
      orderBy: { recordedAt: "desc" },
      select: { id: true, price: true, recordedAt: true, source: true },
    });
    const data = rows.map((r) => ({
      id: r.id,
      price: r.price,
      recordedAt: r.recordedAt.toISOString(),
      source: r.source,
    }));
    return NextResponse.json({ ok: true, data });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
