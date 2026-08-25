/**
 * Prefill כמויות לספירה חדשה — SSOT = previousQuantity (ספירה אחרונה למיקום).
 * פירוט לפי מיקומי ספירה (workers) הוא שכבת תצוגה בלבד; אסור לאפס מלאי
 * כש־worker IDs לא תואמים לשורות ישנות.
 */

export type PrefillProductRow = {
  id: string;
  previousQuantity?: number | null;
  lastWorkerQtys?: {
    inventoryLocationWorkerId: string;
    countedQuantity: number;
  }[] | null;
};

export type PrefillWorker = { id: string };

export type PrefillWorkerQtyMap = Record<string, string>;

/**
 * בונה ערכי ברירת מחדל לשדות הספירה.
 * - בלי workers: actual = previousQuantity
 * - עם workers + lastWorkerQtys תואמים: כמויות לפי worker id
 * - עם workers אבל בלי התאמה / בלי פירוט: previousQuantity על האתר הראשון
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
    let anyMatch = false;

    if (last.length > 0) {
      for (const w of workers) {
        const found = last.find((l) => l.inventoryLocationWorkerId === w.id);
        if (found != null) {
          anyMatch = true;
          map[w.id] = String(found.countedQuantity);
        } else {
          map[w.id] = "0";
        }
      }
    }

    /** IDs של מיקומי ספירה השתנו / אין פירוט — לא מאפסים את מלאי המיקום */
    if (!anyMatch) {
      const first = workers[0];
      if (first) {
        map[first.id] = String(locationQty);
        for (let i = 1; i < workers.length; i++) {
          map[workers[i]!.id] = "0";
        }
      }
    }

    workerQty[row.id] = map;
  }

  return { actual, workerQty };
}
