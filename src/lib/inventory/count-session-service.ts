import { prismaAny } from "@/lib/prisma";

export type CountSessionListItem = {
  id: string;
  sessionNumber: number;
  locationId: string | null;
  locationName: string;
  countDate: string;
  createdAt: string;
  countedByName: string | null;
  productCount: number;
  shortageCount: number;
  surplusCount: number;
  matchCount: number;
  totalCountedQty: number;
  status: string;
};

export type CountSessionWorkerLine = {
  inventoryLocationWorkerId: string;
  workerDisplayName: string;
  workerWorkArea: string;
  countedQuantity: number;
  createdAt: string;
};

export type CountSessionProductLine = {
  id: string;
  inventoryProductId: string;
  name: string;
  nameHe: string | null;
  nameAr: string | null;
  nameEn: string | null;
  barcode: string | null;
  sku: string | null;
  unit: string | null;
  minimumQuantity: number;
  previousQuantity: number;
  currentQuantity: number;
  difference: number;
  workers: CountSessionWorkerLine[];
};

export type CountSessionDetail = CountSessionListItem & {
  lines: CountSessionProductLine[];
};

function serializeSession(row: {
  id: string;
  sessionNumber: number;
  locationId: string | null;
  locationName: string;
  countDate: Date;
  createdAt: Date;
  productCount: number;
  shortageCount: number;
  surplusCount: number;
  matchCount: number;
  totalCountedQty: number;
  status: string;
  countedBy?: { fullName: string } | null;
}): CountSessionListItem {
  return {
    id: row.id,
    sessionNumber: row.sessionNumber,
    locationId: row.locationId,
    locationName: row.locationName,
    countDate: row.countDate.toISOString(),
    createdAt: row.createdAt.toISOString(),
    countedByName: row.countedBy?.fullName ?? null,
    productCount: row.productCount,
    shortageCount: row.shortageCount,
    surplusCount: row.surplusCount,
    matchCount: row.matchCount,
    totalCountedQty: row.totalCountedQty,
    status: row.status,
  };
}

export async function listCountSessions(params: {
  locationId?: string | null;
  locationName?: string | null;
  take?: number;
}): Promise<CountSessionListItem[]> {
  const take = Math.min(200, Math.max(1, params.take ?? 50));
  const locationId = params.locationId?.trim() || null;
  const locationName = params.locationName?.trim() || null;

  const rows = await prismaAny.inventoryCountSession.findMany({
    where: locationId
      ? { locationId }
      : locationName
        ? { locationName: { equals: locationName, mode: "insensitive" } }
        : undefined,
    orderBy: [{ createdAt: "desc" }, { sessionNumber: "desc" }],
    take,
    select: {
      id: true,
      sessionNumber: true,
      locationId: true,
      locationName: true,
      countDate: true,
      createdAt: true,
      productCount: true,
      shortageCount: true,
      surplusCount: true,
      matchCount: true,
      totalCountedQty: true,
      status: true,
      countedBy: { select: { fullName: true } },
    },
  });

  return rows.map(serializeSession);
}

export async function getCountSessionDetail(
  sessionId: string,
): Promise<CountSessionDetail | null> {
  const row = await prismaAny.inventoryCountSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      sessionNumber: true,
      locationId: true,
      locationName: true,
      countDate: true,
      createdAt: true,
      productCount: true,
      shortageCount: true,
      surplusCount: true,
      matchCount: true,
      totalCountedQty: true,
      status: true,
      countedBy: { select: { fullName: true } },
      lines: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          inventoryProductId: true,
          previousQuantity: true,
          currentQuantity: true,
          difference: true,
          inventoryProduct: {
            select: {
              name: true,
              nameHe: true,
              nameAr: true,
              nameEn: true,
              barcode: true,
              sku: true,
              unit: true,
              minimumQuantity: true,
            },
          },
          workerLines: {
            orderBy: { createdAt: "asc" },
            select: {
              inventoryLocationWorkerId: true,
              workerDisplayName: true,
              workerWorkArea: true,
              countedQuantity: true,
              createdAt: true,
              locationWorker: {
                select: { displayName: true, workArea: true, displayOrder: true },
              },
            },
          },
        },
      },
    },
  });

  if (!row) return null;

  return {
    ...serializeSession(row),
    lines: row.lines.map(
      (line: {
        id: string;
        inventoryProductId: string;
        previousQuantity: number;
        currentQuantity: number;
        difference: number;
        inventoryProduct: {
          name: string;
          nameHe: string | null;
          nameAr: string | null;
          nameEn: string | null;
          barcode: string | null;
          sku: string | null;
          unit: string | null;
          minimumQuantity: number;
        };
        workerLines: {
          inventoryLocationWorkerId: string;
          workerDisplayName: string;
          workerWorkArea: string;
          countedQuantity: number;
          createdAt: Date;
          locationWorker: { displayName: string; workArea: string } | null;
        }[];
      }) => ({
        id: line.id,
        inventoryProductId: line.inventoryProductId,
        name: line.inventoryProduct.nameHe?.trim() || line.inventoryProduct.name,
        nameHe: line.inventoryProduct.nameHe,
        nameAr: line.inventoryProduct.nameAr,
        nameEn: line.inventoryProduct.nameEn,
        barcode: line.inventoryProduct.barcode,
        sku: line.inventoryProduct.sku,
        unit: line.inventoryProduct.unit,
        minimumQuantity: line.inventoryProduct.minimumQuantity,
        previousQuantity: line.previousQuantity,
        currentQuantity: line.currentQuantity,
        difference: line.difference,
        workers: line.workerLines.map((w) => ({
          inventoryLocationWorkerId: w.inventoryLocationWorkerId,
          workerDisplayName:
            w.workerDisplayName || w.locationWorker?.displayName || "—",
          workerWorkArea: w.workerWorkArea || w.locationWorker?.workArea || "",
          countedQuantity: w.countedQuantity,
          createdAt: w.createdAt.toISOString(),
        })),
      }),
    ),
  };
}
