import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfToday(): Date {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

export async function GET() {
  const block = await requireDb();
  if (block) return block;
  try {
    const products = await prisma.product.findMany({
      select: { currentStock: true, minStock: true },
    });
    const totalProducts = products.length;
    let shortageCount = 0;
    let lowStockCount = 0;
    for (const p of products) {
      if (p.currentStock <= 0) shortageCount++;
      else if (p.minStock > 0 && p.currentStock <= p.minStock) lowStockCount++;
    }
    const pieOk = totalProducts - shortageCount - lowStockCount;

    const todayMovements = await prisma.inventoryMovement.count({
      where: {
        createdAt: {
          gte: startOfToday(),
          lte: endOfToday(),
        },
      },
    });

    return NextResponse.json({
      ok: true,
      data: {
        totalProducts,
        shortageCount,
        lowStockCount,
        pieOk: Math.max(0, pieOk),
        todayMovements,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
