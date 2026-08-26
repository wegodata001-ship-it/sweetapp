/**
 * Prefill כמויות לספירה חדשה — SSOT = previousQuantity (מידע בלבד).
 * שדות worker = ספירה מחדשה; missing ≠ 0.
 */

export type PrefillLastWorkerQty = {
  inventoryLocationWorkerId: string;
  countedQuantity: number;
  workerWorkArea?: string | null;
  workerDisplayName?: string | null;
};

export type PrefillProductRow = {
  id: string;
  previousQuantity?: number | null;
  lastWorkerQtys?: PrefillLastWorkerQty[] | null;
};

export type PrefillWorker = {
  id: string;
  workArea?: string | null;
  displayName?: string | null;
};

export type PrefillWorkerQtyMap = Record<string, string>;

function normalizeSiteKey(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function uniqueWorkAreaMatch(
  worker: PrefillWorker,
  workers: PrefillWorker[],
  last: PrefillLastWorkerQty[],
  consumed: Set<string>,
): PrefillLastWorkerQty | null {
  const areaKey = normalizeSiteKey(worker.workArea);
  if (!areaKey) return null;
  const lastMatches = last.filter(
    (l) =>
      !consumed.has(l.inventoryLocationWorkerId) &&
      normalizeSiteKey(l.workerWorkArea) === areaKey,
  );
  const workerMatches = workers.filter((w) => normalizeSiteKey(w.workArea) === areaKey);
  if (lastMatches.length !== 1 || workerMatches.length !== 1) return null;
  if (workerMatches[0]!.id !== worker.id) return null;
  return lastMatches[0]!;
}

function uniqueDisplayNameMatch(
  worker: PrefillWorker,
  workers: PrefillWorker[],
  last: PrefillLastWorkerQty[],
  consumed: Set<string>,
): PrefillLastWorkerQty | null {
  const nameKey = normalizeSiteKey(worker.displayName);
  if (!nameKey) return null;
  const lastMatches = last.filter(
    (l) =>
      !consumed.has(l.inventoryLocationWorkerId) &&
      normalizeSiteKey(l.workerDisplayName) === nameKey,
  );
  const workerMatches = workers.filter((w) => normalizeSiteKey(w.displayName) === nameKey);
  if (lastMatches.length !== 1 || workerMatches.length !== 1) return null;
  if (workerMatches[0]!.id !== worker.id) return null;
  return lastMatches[0]!;
}

function matchLastEntry(
  worker: PrefillWorker,
  workers: PrefillWorker[],
  last: PrefillLastWorkerQty[],
  consumed: Set<string>,
): PrefillLastWorkerQty | null {
  const byId = last.find(
    (l) => !consumed.has(l.inventoryLocationWorkerId) && l.inventoryLocationWorkerId === worker.id,
  );
  if (byId) return byId;

  const byArea = uniqueWorkAreaMatch(worker, workers, last, consumed);
  if (byArea) return byArea;

  const byName = uniqueDisplayNameMatch(worker, workers, last, consumed);
  if (byName) return byName;

  return null;
}

/**
 * בונה ערכי ברירת מחדל לשדות הספירה.
 * unset = "" (לא "0"). אין התאמה → כל הנקודות unset.
 */
export function buildPrefillFromLastCount(
  rows: PrefillProductRow[],
  workers: PrefillWorker[],
): { actual: Record<string, string>; workerQty: Record<string, PrefillWorkerQtyMap> } {
  const actual: Record<string, string> = {};
  const workerQty: Record<string, PrefillWorkerQtyMap> = {};

  for (const row of rows) {
    const locationQty = Math.max(0, Number(row.previousQuantity) || 0);

    if (workers.length === 0) {
      actual[row.id] = String(locationQty);
      continue;
    }

    const map: PrefillWorkerQtyMap = {};
    const last = row.lastWorkerQtys ?? [];
    const consumed = new Set<string>();

    for (const w of workers) {
      map[w.id] = "";
    }

    if (last.length > 0) {
      for (const w of workers) {
        const matched = matchLastEntry(w, workers, last, consumed);
        if (matched) {
          consumed.add(matched.inventoryLocationWorkerId);
          map[w.id] = String(matched.countedQuantity);
        }
      }
    }

    workerQty[row.id] = map;
  }

  return { actual, workerQty };
}
