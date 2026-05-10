import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";

export async function GET() {
  const block = await requireDb();
  if (block) return block;
  try {
    const items = await prisma.inventoryItem.findMany({
      orderBy: { itemName: "asc" },
      include: {
        movements: { orderBy: { createdAt: "desc" }, take: 15 },
      },
    });
    return NextResponse.json({ ok: true, data: items });
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
  try {
    const body = (await req.json()) as { itemName: string; initialStock?: number };
    if (!body.itemName?.trim()) return NextResponse.json({ ok: false, error: "חסר שם פריט" }, { status: 400 });
    const start = body.initialStock ?? 0;
    const row = await prisma.inventoryItem.create({
      data: {
        itemName: body.itemName.trim(),
        currentStock: start,
        movements:
          start !== 0
            ? {
                create: {
                  movementType: "opening",
                  quantity: start,
                  note: "מלאי פתיחה",
                },
              }
            : undefined,
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
