import { NextResponse } from "next/server";
import { prismaAny } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import { classifyStockTier } from "@/lib/inventory/product-filters";

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
    const products = await prismaAny.inventoryProduct.findMany({
      include: {
        inventoryLocation: { select: { id: true, name: true } },
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
    const byLocationMap = new Map<
      string,
      { key: string; name: string; total: number; shortage: number; low: number; zero: number }
    >();

    for (const p of products) {
      const q = p.counts[0]?.currentQuantity ?? null;
      const tier = classifyStockTier(q, p.minimumQuantity);
      if (tier === "short") shortageCount++;
      else if (tier === "low") lowStockCount++;

      const key = p.locationId ?? `legacy:${p.location || "—"}`;
      const name = (p.inventoryLocation?.name ?? p.location) || "ללא מיקום";
      const cur = byLocationMap.get(key) ?? { key, name, total: 0, shortage: 0, low: 0, zero: 0 };
      cur.total += 1;
      if (tier === "short") cur.shortage += 1;
      else if (tier === "low") cur.low += 1;
      else if (tier === "zero") cur.zero += 1;
      byLocationMap.set(key, cur);
    }

    const pieOk = Math.max(0, totalProducts - shortageCount - lowStockCount);

    const todayMovements = await prismaAny.inventoryMovement.count({
      where: {
        createdAt: {
          gte: startOfToday(),
          lte: endOfToday(),
        },
      },
    });

    const byLocation = [...byLocationMap.values()].sort((a, b) => a.name.localeCompare(b.name, "he"));

    return NextResponse.json({
      ok: true,
      data: {
        totalProducts,
        shortageCount,
        lowStockCount,
        pieOk,
        todayMovements,
        byLocation,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
