import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import { buildInventoryCountCreatedAtFilter } from "@/lib/inventory/count-history-query";

const MAX_ROWS = 800;

export async function GET(req: NextRequest) {
  const block = await requireDb();
  if (block) return block;
  try {
    const { searchParams } = req.nextUrl;
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    const timeFrom = searchParams.get("timeFrom");
    const timeTo = searchParams.get("timeTo");
    const productId = searchParams.get("productId")?.trim() ?? "";
    const countedByUserId = searchParams.get("countedByUserId")?.trim() ?? "";
    const onlyShortage = searchParams.get("onlyShortage") === "1";
    const onlySurplus = searchParams.get("onlySurplus") === "1";

    const where: Prisma.InventoryCountWhereInput = {};

    const createdAt = buildInventoryCountCreatedAtFilter({
      dateFrom,
      dateTo,
      timeFrom,
      timeTo,
    });
    if (createdAt) {
      where.createdAt = createdAt;
    }

    if (productId) {
      where.inventoryProductId = productId;
    }
    if (countedByUserId) {
      where.countedByUserId = countedByUserId;
    }
    if (onlyShortage) {
      where.difference = { lt: 0 };
    } else if (onlySurplus) {
      where.difference = { gt: 0 };
    }

    const rows = await prisma.inventoryCount.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { countDate: "desc" }],
      take: MAX_ROWS,
      include: {
        countedBy: { select: { id: true, fullName: true, email: true } },
        inventoryProduct: {
          select: {
            id: true,
            name: true,
            location: true,
            unit: true,
            inventoryLocation: { select: { name: true } },
          },
        },
      },
    });

    return NextResponse.json({
      ok: true,
      data: rows.map((row) => {
        const locName =
          row.inventoryProduct.inventoryLocation?.name?.trim() ||
          row.inventoryProduct.location?.trim() ||
          "";
        return {
          id: row.id,
          countDate: row.countDate.toISOString(),
          createdAt: row.createdAt.toISOString(),
          previousQuantity: row.previousQuantity,
          currentQuantity: row.currentQuantity,
          difference: row.difference,
          note: row.note,
          countedBy: row.countedBy,
          product: {
            id: row.inventoryProduct.id,
            name: row.inventoryProduct.name,
            location: locName,
            unit: row.inventoryProduct.unit,
          },
        };
      }),
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
