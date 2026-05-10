import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";

export async function POST(req: NextRequest) {
  const block = await requireDb();
  if (block) return block;
  try {
    const body = (await req.json()) as {
      inventoryItemId: string;
      movementType: string;
      quantity: number;
      note?: string | null;
    };
    if (!body.inventoryItemId || !body.movementType?.trim()) {
      return NextResponse.json({ ok: false, error: "חסרים שדות" }, { status: 400 });
    }

    const qty = Math.abs(body.quantity);
    if (qty === 0 && body.movementType !== "adjustment") {
      return NextResponse.json({ ok: false, error: "כמות לא תקינה" }, { status: 400 });
    }

    const item = await prisma.inventoryItem.findUnique({ where: { id: body.inventoryItemId } });
    if (!item) return NextResponse.json({ ok: false, error: "פריט לא נמצא" }, { status: 404 });

    const t = body.movementType.toLowerCase();
    let delta = 0;
    if (t === "sale") delta = -qty;
    else if (t === "purchase" || t === "added") delta = qty;
    else if (t === "adjustment") delta = body.quantity;
    else if (t === "count") delta = body.quantity - item.currentStock;
    else delta = body.quantity;

    const nextStock = item.currentStock + delta;

    const { movement, currentStock } = await prisma.$transaction(async (tx) => {
      const movement = await tx.inventoryMovement.create({
        data: {
          inventoryItemId: body.inventoryItemId,
          movementType: body.movementType,
          quantity: t === "adjustment" ? body.quantity : qty,
          note: body.note?.trim() || null,
        },
      });
      await tx.inventoryItem.update({
        where: { id: body.inventoryItemId },
        data: { currentStock: nextStock },
      });
      return { movement, currentStock: nextStock };
    });

    return NextResponse.json({ ok: true, data: movement, currentStock });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
