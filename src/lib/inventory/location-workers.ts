import { prismaAny } from "@/lib/prisma";

/**
 * Single Source of Truth for storage-location workers.
 * Physical columns: locationId / name / area / sortOrder (via Prisma @map).
 * App code must only read/write through this module + InventoryLocationWorker.
 */

export type LocationWorkerInput = {
  id?: string;
  displayName?: string;
  workArea?: string | null;
  displayOrder?: number;
  employeeId?: string | null;
  isActive?: boolean;
};

export type LocationWorkerRow = {
  id: string;
  inventoryLocationId: string;
  employeeId: string | null;
  displayName: string;
  workArea: string;
  displayOrder: number;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export const WORKER_SELECT = {
  id: true,
  inventoryLocationId: true,
  employeeId: true,
  displayName: true,
  workArea: true,
  displayOrder: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

type DbWorker = {
  id: string;
  inventoryLocationId: string;
  employeeId: string | null;
  displayName: string;
  workArea: string;
  displayOrder: number;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
};

export function serializeWorker(row: DbWorker): LocationWorkerRow {
  return {
    id: row.id,
    inventoryLocationId: row.inventoryLocationId,
    employeeId: row.employeeId,
    displayName: row.displayName,
    workArea: row.workArea,
    displayOrder: row.displayOrder,
    isActive: row.isActive,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : undefined,
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : undefined,
  };
}

function normalizeWorkerInputs(workers: LocationWorkerInput[] | undefined | null): {
  id?: string;
  displayName: string;
  workArea: string;
  displayOrder: number;
  employeeId: string | null;
}[] {
  if (!Array.isArray(workers)) return [];
  return workers
    .map((w, idx) => {
      const displayName = (w.displayName ?? "").trim();
      const workArea = (w.workArea ?? "").trim();
      const displayOrder = Number.isFinite(Number(w.displayOrder))
        ? Number(w.displayOrder)
        : idx;
      return {
        id: w.id?.trim() || undefined,
        displayName,
        workArea,
        displayOrder,
        employeeId: w.employeeId?.trim() || null,
      };
    })
    .filter((w) => w.displayName.length > 0)
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map((w, idx) => ({ ...w, displayOrder: idx }));
}

/** Soft-sync workers — never hard-deletes (sets isActive=false). */
export async function syncLocationWorkers(
  inventoryLocationId: string,
  workers: LocationWorkerInput[] | undefined | null,
  tx: typeof prismaAny = prismaAny,
): Promise<LocationWorkerRow[]> {
  const normalized = normalizeWorkerInputs(workers);
  const existing = (await tx.inventoryLocationWorker.findMany({
    where: { inventoryLocationId },
    select: { id: true },
  })) as { id: string }[];
  const existingIds = new Set(existing.map((e) => e.id));
  const keptIds = new Set<string>();

  for (const w of normalized) {
    if (w.id && existingIds.has(w.id)) {
      await tx.inventoryLocationWorker.update({
        where: { id: w.id },
        data: {
          displayName: w.displayName,
          workArea: w.workArea,
          displayOrder: w.displayOrder,
          employeeId: w.employeeId,
          isActive: true,
        },
      });
      keptIds.add(w.id);
    } else {
      const created = await tx.inventoryLocationWorker.create({
        data: {
          inventoryLocationId,
          displayName: w.displayName,
          workArea: w.workArea,
          displayOrder: w.displayOrder,
          employeeId: w.employeeId,
          isActive: true,
        },
        select: { id: true },
      });
      keptIds.add(created.id);
    }
  }

  const toDeactivate = existing.filter((e) => !keptIds.has(e.id)).map((e) => e.id);
  if (toDeactivate.length > 0) {
    await tx.inventoryLocationWorker.updateMany({
      where: { id: { in: toDeactivate } },
      data: { isActive: false },
    });
  }

  return listLocationWorkers(inventoryLocationId, tx);
}

export async function listLocationWorkers(
  inventoryLocationId: string,
  tx: typeof prismaAny = prismaAny,
): Promise<LocationWorkerRow[]> {
  const rows = (await tx.inventoryLocationWorker.findMany({
    where: { inventoryLocationId, isActive: true },
    orderBy: { displayOrder: "asc" },
    select: WORKER_SELECT,
  })) as DbWorker[];
  return rows.map(serializeWorker);
}
