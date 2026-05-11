import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import type { Prisma } from "@prisma/client";

function inventoryStatus(
  current: number | null,
  minimumQuantity: number,
): "חסר" | "נמוך" | "תקין" {
  const q = current ?? 0;
  const min = minimumQuantity;
  if (min > 0 && q < min) return "חסר";
  if (min > 0 && q === min) return "נמוך";
  return "תקין";
}

export async function GET(req: NextRequest) {
  const block = await requireDb();
  if (block) return block;
  try {
    const { searchParams } = req.nextUrl;
    const q = searchParams.get("q")?.trim() ?? "";
    const onlyShortage = searchParams.get("onlyShortage") === "1";
    const onlyBelowMin = searchParams.get("onlyBelowMin") === "1";
    const category = searchParams.get("category")?.trim() ?? "";
    const limitRaw = searchParams.get("limit");
    const limit = limitRaw ? Math.min(500, Math.max(1, parseInt(limitRaw, 10) || 80)) : undefined;

    const where: Prisma.InventoryProductWhereInput = {};
    if (q) {
      where.name = { contains: q, mode: "insensitive" };
    }
    if (category) {
      where.category = category;
    }

    const rows = await prisma.inventoryProduct.findMany({
      where,
      orderBy: [{ location: "asc" }, { name: "asc" }],
      take: limit,
      include: {
        counts: {
          orderBy: { countDate: "desc" },
          take: 1,
          include: {
            countedBy: { select: { id: true, fullName: true, email: true } },
          },
        },
      },
    });

    let mapped = rows.map((p) => {
      const latest = p.counts[0];
      const currentQuantity = latest ? latest.currentQuantity : null;
      const lastCountedAt = latest ? latest.countDate.toISOString() : null;
      const countedBy = latest?.countedBy ?? null;
      const minimumQuantity = p.minimumQuantity;
      const status = inventoryStatus(currentQuantity, minimumQuantity);
      return {
        id: p.id,
        name: p.name,
        category: p.category,
        location: p.location,
        unit: p.unit,
        currentQuantity,
        minimumQuantity,
        lastCountedAt,
        countedBy,
        status,
      };
    });

    if (onlyShortage) {
      mapped = mapped.filter((r) => r.status === "חסר");
    }
    if (onlyBelowMin) {
      mapped = mapped.filter((r) => r.status === "חסר" || r.status === "נמוך");
    }

    return NextResponse.json({ ok: true, data: mapped });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
