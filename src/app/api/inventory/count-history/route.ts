import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { buildInventoryCountCreatedAtFilter } from "@/lib/inventory/count-history-query";
import { listProductCountTimeline } from "@/lib/inventory/count-product-timeline";
import { israelCreatedAtRange } from "@/lib/inventory/count-history-audit";
import { changeFlags } from "@/lib/inventory/count-history-audit";

const MAX_ROWS = 200;

/** GET — היסטוריית שורות ספירה / timeline מוצר — READ ONLY */
export async function GET(req: NextRequest) {
  const block = await requireDb();
  if (block) return block;
  const session = await getSessionFromCookie();
  if (!session?.sub) {
    return NextResponse.json({ ok: false, error: "נדרשת התחברות" }, { status: 401 });
  }

  try {
    const { searchParams } = req.nextUrl;
    const mode = searchParams.get("mode")?.trim() || "lines";
    const productId = searchParams.get("productId")?.trim() ?? "";
    const locationId = searchParams.get("locationId")?.trim() || null;
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");

    if (mode === "timeline") {
      if (!productId) {
        return NextResponse.json(
          { ok: false, error: "נדרש productId ל־timeline" },
          { status: 400 },
        );
      }
      const data = await listProductCountTimeline({
        productId,
        locationId,
        dateFrom,
        dateTo,
        take: Math.min(200, parseInt(searchParams.get("take") || "60", 10) || 60),
      });
      return NextResponse.json({ ok: true, data });
    }

    const timeFrom = searchParams.get("timeFrom");
    const timeTo = searchParams.get("timeTo");
    const countedByUserId = searchParams.get("countedByUserId")?.trim() ?? "";
    const location = searchParams.get("location")?.trim() ?? "";
    const onlyShortage = searchParams.get("onlyShortage") === "1";
    const onlySurplus = searchParams.get("onlySurplus") === "1";
    const includeWorkers = searchParams.get("includeWorkers") === "1";

    const where: Prisma.InventoryCountWhereInput = {};

    if (dateFrom?.trim() && dateTo?.trim() && !timeFrom && !timeTo) {
      where.createdAt = israelCreatedAtRange(dateFrom.trim(), dateTo.trim());
    } else {
      const createdAt = buildInventoryCountCreatedAtFilter({
        dateFrom,
        dateTo,
        timeFrom,
        timeTo,
      });
      if (createdAt) where.createdAt = createdAt;
    }

    if (productId) where.inventoryProductId = productId;
    if (countedByUserId) where.countedByUserId = countedByUserId;
    if (locationId) {
      where.locationId = locationId;
    } else if (location) {
      where.OR = [
        { location: { name: { equals: location, mode: "insensitive" } } },
        {
          inventoryProduct: {
            OR: [
              { location: { equals: location, mode: "insensitive" } },
              { inventoryLocation: { name: { equals: location, mode: "insensitive" } } },
            ],
          },
        },
      ];
    }
    if (onlyShortage) where.difference = { lt: 0 };
    else if (onlySurplus) where.difference = { gt: 0 };

    const rows = await prisma.inventoryCount.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { countDate: "desc" }],
      take: MAX_ROWS,
      include: {
        countedBy: { select: { id: true, fullName: true, email: true } },
        location: { select: { id: true, name: true } },
        session: { select: { id: true, status: true, sessionNumber: true, locationName: true } },
        inventoryProduct: {
          select: {
            id: true,
            name: true,
            nameHe: true,
            location: true,
            unit: true,
            inventoryLocation: { select: { name: true } },
          },
        },
        ...(includeWorkers
          ? {
              workerLines: {
                orderBy: { createdAt: "asc" as const },
                select: {
                  inventoryLocationWorkerId: true,
                  workerDisplayName: true,
                  workerWorkArea: true,
                  countedQuantity: true,
                },
              },
            }
          : {}),
      },
    });

    return NextResponse.json({
      ok: true,
      data: rows.map((row) => {
        const locName =
          row.location?.name?.trim() ||
          row.session?.locationName?.trim() ||
          row.inventoryProduct.inventoryLocation?.name?.trim() ||
          row.inventoryProduct.location?.trim() ||
          "";
        const flags = changeFlags(row.previousQuantity, row.currentQuantity);
        return {
          id: row.id,
          sessionId: row.sessionId,
          sessionStatus: row.session?.status ?? null,
          sessionNumber: row.session?.sessionNumber ?? null,
          countDate: row.countDate.toISOString(),
          createdAt: row.createdAt.toISOString(),
          previousQuantity: row.previousQuantity,
          currentQuantity: row.currentQuantity,
          difference: row.difference,
          minimumQuantity: row.minimumQuantity,
          note: row.note,
          locationId: row.locationId,
          locationName: locName,
          positiveToZero: flags.positiveToZero,
          significantDrop: flags.significantDrop,
          countedBy: row.countedBy,
          product: {
            id: row.inventoryProduct.id,
            name: row.inventoryProduct.nameHe?.trim() || row.inventoryProduct.name,
            location: locName,
            unit: row.inventoryProduct.unit,
          },
          workers: includeWorkers
            ? (
                row as typeof row & {
                  workerLines?: Array<{
                    inventoryLocationWorkerId: string;
                    workerDisplayName: string;
                    workerWorkArea: string;
                    countedQuantity: number;
                  }>;
                }
              ).workerLines?.map((w) => ({
                inventoryLocationWorkerId: w.inventoryLocationWorkerId,
                workerDisplayName: w.workerDisplayName || "—",
                workerWorkArea: w.workerWorkArea || "",
                countedQuantity: w.countedQuantity,
              })) ?? []
            : undefined,
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
