import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string; productId: string }> }) {
  const block = await requireDb();
  if (block) return block;
  const { id: supplierId, productId } = await ctx.params;
  try {
    const body = (await req.json()) as {
      productName?: string;
      regularPrice?: number;
      unit?: string | null;
      notes?: string | null;
      /** כשמעדכנים מחיר רגיל — נרשם גם בהיסטוריה */
      recordPrice?: boolean;
    };

    const existing = await prisma.supplierProduct.findFirst({
      where: { id: productId, supplierId },
    });
    if (!existing) return NextResponse.json({ ok: false, error: "לא נמצא" }, { status: 404 });

    const nextName = body.productName !== undefined ? body.productName.trim() : existing.productName;
    const nextUnit = body.unit !== undefined ? body.unit?.trim() || null : existing.unit;
    const nextNotes = body.notes !== undefined ? body.notes?.trim() || null : existing.notes;
    let nextPrice = existing.regularPrice;
    if (body.regularPrice !== undefined) {
      const n = Number(body.regularPrice);
      if (!Number.isFinite(n) || n < 0) {
        return NextResponse.json({ ok: false, error: "מחיר לא תקין" }, { status: 400 });
      }
      nextPrice = n;
    }

    const row = await prisma.supplierProduct.update({
      where: { id: productId },
      data: {
        productName: nextName,
        regularPrice: nextPrice,
        unit: nextUnit,
        notes: nextNotes,
      },
    });

    const shouldRecord =
      body.recordPrice !== false &&
      body.regularPrice !== undefined &&
      Math.abs(nextPrice - existing.regularPrice) > 1e-6;
    if (shouldRecord) {
      await prisma.supplierProductPriceHistory.create({
        data: { supplierProductId: productId, price: nextPrice, source: "manual" },
      });
    }

    return NextResponse.json({ ok: true, data: row });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string; productId: string }> }) {
  const block = await requireDb();
  if (block) return block;
  const { id: supplierId, productId } = await ctx.params;
  try {
    const existing = await prisma.supplierProduct.findFirst({
      where: { id: productId, supplierId },
    });
    if (!existing) return NextResponse.json({ ok: false, error: "לא נמצא" }, { status: 404 });
    await prisma.supplierProduct.delete({ where: { id: productId } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
