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

function classify(current: number | null, min: number): "shortage" | "low" | "ok" {
  const q = current ?? 0;
  if (min > 0 && q < min) return "shortage";
  if (min > 0 && q === min) return "low";
  return "ok";
}

export async function GET() {
  const block = await requireDb();
  if (block) return block;
  try {
    const products = await prisma.inventoryProduct.findMany({
      include: {
        counts: {
          orderBy: { countDate: "desc" },
          take: 1,
          select: { currentQuantity: true },
        },
      },
    });

    const totalProducts = products.length;
    let shortageCount = 0;
    let lowStockCount = 0;
    for (const p of products) {
      const q = p.counts[0]?.currentQuantity ?? null;
      const tier = classify(q, p.minimumQuantity);
      if (tier === "shortage") shortageCount++;
      else if (tier === "low") lowStockCount++;
    }
    const pieOk = Math.max(0, totalProducts - shortageCount - lowStockCount);

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
        pieOk,
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
