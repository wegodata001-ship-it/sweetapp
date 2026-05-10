import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";

/** רשימת מוצרים עם מלאי (תאימות + טעינה מהירה) */
export async function GET() {
  const block = await requireDb();
  if (block) return block;
  try {
    const rows = await prisma.product.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        currentStock: true,
        minStock: true,
        category: { select: { id: true, name: true } },
        supplier: { select: { id: true, name: true } },
      },
    });
    return NextResponse.json({ ok: true, data: rows });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}

/** יצירת מוצר בסיסי למלאי (אופציונלי) */
export async function POST(req: NextRequest) {
  const block = await requireDb();
  if (block) return block;
  try {
    const body = (await req.json()) as {
      name: string;
      minStock?: number;
      currentStock?: number;
      categoryId?: string | null;
      supplierId?: string | null;
    };
    if (!body.name?.trim()) {
      return NextResponse.json({ ok: false, error: "חסר שם מוצר" }, { status: 400 });
    }
    const minStock = Math.max(0, Math.trunc(Number(body.minStock ?? 0)));
    const currentStock = Math.max(0, Math.trunc(Number(body.currentStock ?? 0)));

    const row = await prisma.product.create({
      data: {
        name: body.name.trim(),
        minStock,
        currentStock,
        categoryId: body.categoryId?.trim() || null,
        supplierId: body.supplierId?.trim() || null,
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
