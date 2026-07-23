import { prismaAny } from "@/lib/prisma";

export type LocationWorkerInput = {
  id?: string;
  name: string;
  area?: string | null;
  sortOrder?: number;
};

export type LocationWorkerRow = {
  id: string;
  name: string;
  area: string;
  sortOrder: number;
  employeeId?: string | null;
  isActive?: boolean;
};

export function normalizeWorkerInputs(
  workers: LocationWorkerInput[] | undefined | null,
): { name: string; area: string; sortOrder: number }[] {
  if (!Array.isArray(workers)) return [];
  return workers
    .map((w, idx) => ({
      name: (w.name ?? "").trim(),
      area: (w.area ?? "").trim(),
      sortOrder: Number.isFinite(Number(w.sortOrder)) ? Number(w.sortOrder) : idx,
    }))
    .filter((w) => w.name.length > 0)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((w, idx) => ({ ...w, sortOrder: idx }));
}

export const WORKER_SELECT = {
  id: true,
  name: true,
  area: true,
  sortOrder: true,
  employeeId: true,
  isActive: true,
} as const;

/** Replace all workers for a location (delete + create). */
export async function replaceLocationWorkers(
  locationId: string,
  workers: LocationWorkerInput[] | undefined | null,
  tx: typeof prismaAny = prismaAny,
): Promise<LocationWorkerRow[]> {
  const normalized = normalizeWorkerInputs(workers);
  await tx.inventoryLocationWorker.deleteMany({ where: { locationId } });
  if (normalized.length === 0) return [];
  await tx.inventoryLocationWorker.createMany({
    data: normalized.map((w) => ({
      locationId,
      name: w.name,
      area: w.area,
      sortOrder: w.sortOrder,
      isActive: true,
    })),
  });
  const rows = await tx.inventoryLocationWorker.findMany({
    where: { locationId, isActive: true },
    orderBy: { sortOrder: "asc" },
    select: WORKER_SELECT,
  });
  return rows as LocationWorkerRow[];
}

export async function listLocationWorkers(locationId: string): Promise<LocationWorkerRow[]> {
  const rows = await prismaAny.inventoryLocationWorker.findMany({
    where: { locationId, isActive: true },
    orderBy: { sortOrder: "asc" },
    select: WORKER_SELECT,
  });
  return rows as LocationWorkerRow[];
}
