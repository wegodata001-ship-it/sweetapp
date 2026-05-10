import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const block = await requireDb();
  if (block) return block;
  const { id } = await ctx.params;
  if (!id?.trim()) {
    return NextResponse.json({ ok: false, error: "חסר מזהה" }, { status: 400 });
  }
  try {
    const body = (await req.json()) as {
      minStock?: number;
      categoryId?: string | null;
      supplierId?: string | null;
    };
    const data: {
      minStock?: number;
      categoryId?: string | null;
      supplierId?: string | null;
    } = {};
    if (body.minStock !== undefined) {
      data.minStock = Math.max(0, Math.trunc(Number(body.minStock)));
    }
    if (body.categoryId !== undefined) {
      data.categoryId = body.categoryId?.trim() || null;
    }
    if (body.supplierId !== undefined) {
      data.supplierId = body.supplierId?.trim() || null;
    }
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ ok: false, error: "אין שדות לעדכון" }, { status: 400 });
    }
    const row = await prisma.product.update({
      where: { id: id.trim() },
      data,
      include: {
        category: { select: { id: true, name: true } },
        supplier: { select: { id: true, name: true } },
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
