/**
 * READ-ONLY: product timeline לפי productId + locationId (בידוד מחסנים).
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { israelCreatedAtRange } from "@/lib/inventory/count-history-audit";
import { changeFlags } from "@/lib/inventory/count-history-audit";

export type ProductTimelineWorker = {
  inventoryLocationWorkerId: string;
  workerDisplayName: string;
  workerWorkArea: string;
  countedQuantity: number;
};

export type ProductTimelineItem = {
  id: string;
  sessionId: string | null;
  sessionStatus: string | null;
  sessionNumber: number | null;
  productId: string;
  productName: string;
  locationId: string | null;
  locationName: string;
  countDate: string;
  createdAt: string;
  previousQuantity: number;
  currentQuantity: number;
  difference: number;
  minimumQuantity: number;
  countedByUserId: string | null;
  countedByName: string | null;
  positiveToZero: boolean;
  significantDrop: boolean;
  workers: ProductTimelineWorker[];
};

export async function listProductCountTimeline(params: {
  productId: string;
  locationId: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  take?: number;
}): Promise<ProductTimelineItem[]> {
  const take = Math.min(200, Math.max(1, params.take ?? 60));
  const productId = params.productId.trim();
  if (!productId) return [];

  const where: Prisma.InventoryCountWhereInput = {
    inventoryProductId: productId,
  };

  if (params.locationId?.trim()) {
    where.locationId = params.locationId.trim();
  } else {
    // ללא locationId — רק ספירות ללא מיקום (legacy), לא לערבב מחסנים
    where.locationId = null;
  }

  if (params.dateFrom?.trim() && params.dateTo?.trim()) {
    where.createdAt = israelCreatedAtRange(params.dateFrom.trim(), params.dateTo.trim());
  }

  const rows = await prisma.inventoryCount.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { countDate: "desc" }],
    take,
    select: {
      id: true,
      sessionId: true,
      previousQuantity: true,
      currentQuantity: true,
      difference: true,
      minimumQuantity: true,
      countDate: true,
      createdAt: true,
      countedByUserId: true,
      locationId: true,
      countedBy: { select: { fullName: true } },
      location: { select: { name: true } },
      session: { select: { status: true, sessionNumber: true, locationName: true } },
      inventoryProduct: {
        select: {
          name: true,
          nameHe: true,
        },
      },
      workerLines: {
        orderBy: { createdAt: "asc" },
        select: {
          inventoryLocationWorkerId: true,
          workerDisplayName: true,
          workerWorkArea: true,
          countedQuantity: true,
          locationWorker: {
            select: { displayName: true, workArea: true },
          },
        },
      },
    },
  });

  return rows.map((row) => {
    const flags = changeFlags(row.previousQuantity, row.currentQuantity);
    const locationName =
      row.location?.name?.trim() ||
      row.session?.locationName?.trim() ||
      "";
    return {
      id: row.id,
      sessionId: row.sessionId,
      sessionStatus: row.session?.status ?? null,
      sessionNumber: row.session?.sessionNumber ?? null,
      productId,
      productName:
        row.inventoryProduct.nameHe?.trim() || row.inventoryProduct.name,
      locationId: row.locationId,
      locationName,
      countDate: row.countDate.toISOString(),
      createdAt: row.createdAt.toISOString(),
      previousQuantity: row.previousQuantity,
      currentQuantity: row.currentQuantity,
      difference: row.difference,
      minimumQuantity: row.minimumQuantity,
      countedByUserId: row.countedByUserId,
      countedByName: row.countedBy?.fullName ?? null,
      positiveToZero: flags.positiveToZero,
      significantDrop: flags.significantDrop,
      workers: row.workerLines.map((w) => ({
        inventoryLocationWorkerId: w.inventoryLocationWorkerId,
        workerDisplayName:
          w.workerDisplayName || w.locationWorker?.displayName || "—",
        workerWorkArea: w.workerWorkArea || w.locationWorker?.workArea || "",
        countedQuantity: w.countedQuantity,
      })),
    };
  });
}
