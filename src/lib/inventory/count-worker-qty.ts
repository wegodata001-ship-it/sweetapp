import type { LocationWorkerDto } from "@/components/ops/inventory-count/types";

export type WorkerQtyMap = Record<string, string>;

export type WorkerQtyAnalysis = {
  /** סכום כשכל הנקודות הושלמו; null אם אין ערך או חסר נקודה */
  total: number | null;
  /** סכום נקודות שכבר הוזן (כולל 0 מפורש) */
  partialSum: number;
  unsetCount: number;
  /** כל נקודות הספירה של המיקום הוזנו (0 מפורש תקין) */
  complete: boolean;
  unsetWorkerIds: string[];
};

/** מפרש שדה כמות — ריק = unset, לא 0 */
export function parseWorkerQtyField(raw: string | undefined): number | null {
  if (raw === undefined || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return Number.NaN;
  return n;
}

export function analyzeWorkerQuantities(
  workers: LocationWorkerDto[],
  workerQtys: WorkerQtyMap,
): WorkerQtyAnalysis {
  if (workers.length === 0) {
    return {
      total: null,
      partialSum: 0,
      unsetCount: 0,
      complete: true,
      unsetWorkerIds: [],
    };
  }

  let partialSum = 0;
  let unsetCount = 0;
  const unsetWorkerIds: string[] = [];
  let hasInvalid = false;

  for (const w of workers) {
    const parsed = parseWorkerQtyField(workerQtys[w.id]);
    if (parsed === null) {
      unsetCount += 1;
      unsetWorkerIds.push(w.id);
      continue;
    }
    if (Number.isNaN(parsed)) {
      hasInvalid = true;
      continue;
    }
    partialSum += parsed;
  }

  const complete = !hasInvalid && unsetCount === 0;
  return {
    total: complete ? partialSum : null,
    partialSum,
    unsetCount,
    complete,
    unsetWorkerIds,
  };
}

/** סה״כ נספר — null אם לא הושלם או אין ערכים */
export function sumWorkerQuantities(
  workers: LocationWorkerDto[],
  workerQtys: WorkerQtyMap,
): number | null {
  return analyzeWorkerQuantities(workers, workerQtys).total;
}
