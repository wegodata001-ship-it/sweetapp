import { NextResponse } from "next/server";
import { prismaAny } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import { classifyStockTier } from "@/lib/inventory/product-filters";

export type ShelfSummaryDto = {
  name: string;
  productCount: number;
  shortageCount: number;
};

/** מדפים/אזורים לפי `InventoryProduct.location` (מחרוזת) + ספירת פריטים וחוסרים */
export async function GET() {
  const block = await requireDb();
  if (block) return block;
  try {
    const rows = await prismaAny.inventoryProduct.findMany({
      where: {
        NOT: { location: { equals: "", mode: "insensitive" } },
      },
      select: {
        location: true,
        minimumQuantity: true,
        counts: {
          orderBy: { countDate: "desc" },
          take: 1,
          select: { currentQuantity: true },
        },
      },
    });

    const map = new Map<string, { name: string; productCount: number; shortageCount: number }>();
    for (const p of rows) {
      const name = (p.location ?? "").trim();
      if (!name) continue;
      const latest = p.counts[0]?.currentQuantity ?? null;
      const tier = classifyStockTier(latest, p.minimumQuantity);
      const cur = map.get(name) ?? { name, productCount: 0, shortageCount: 0 };
      cur.productCount += 1;
      if (tier === "short") cur.shortageCount += 1;
      map.set(name, cur);
    }

    const data: ShelfSummaryDto[] = [...map.values()].sort((a, b) =>
      a.name.localeCompare(b.name, "he", { sensitivity: "base" }),
    );

    return NextResponse.json({ ok: true, data });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
