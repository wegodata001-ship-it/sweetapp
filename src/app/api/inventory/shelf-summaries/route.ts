import { NextResponse } from "next/server";
import { prismaAny } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";

export type ShelfSummaryDto = {
  name: string;
  productCount: number;
  shortageCount: number;
  surplusCount: number;
  okCount: number;
  matchPct: number;
};

/** מדפים לפי `InventoryProduct.location` + סטטוס התאמה מהספירה האחרונה */
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
        counts: {
          orderBy: { countDate: "desc" },
          take: 1,
          select: { difference: true },
        },
      },
    });

    const map = new Map<
      string,
      {
        name: string;
        productCount: number;
        shortageCount: number;
        surplusCount: number;
        okCount: number;
      }
    >();

    for (const p of rows) {
      const name = (p.location ?? "").trim();
      if (!name) continue;
      const latest = p.counts[0];
      const cur = map.get(name) ?? {
        name,
        productCount: 0,
        shortageCount: 0,
        surplusCount: 0,
        okCount: 0,
      };
      cur.productCount += 1;
      if (latest) {
        const diff = latest.difference;
        if (diff < 0) cur.shortageCount += 1;
        else if (diff > 0) cur.surplusCount += 1;
        else cur.okCount += 1;
      }
      map.set(name, cur);
    }

    const data: ShelfSummaryDto[] = [...map.values()]
      .map((s) => ({
        ...s,
        matchPct:
          s.productCount > 0 ? Math.round((s.okCount / s.productCount) * 100) : 100,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "he", { sensitivity: "base" }));

    return NextResponse.json({ ok: true, data });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
