/**
 * Draft מקומי לספירה — לא נוגע ב־DB.
 * מפתח: locationId + יום ספירה עסקי (בידוד מיקומים).
 */

export type CountDraftBaseCount = {
  countId: string;
  createdAt: string;
};

export type CountDraftPayloadV2 = {
  version: 2;
  locationId: string;
  countDate: string;
  actualById: Record<string, string>;
  workerQtyByProduct: Record<string, Record<string, string>>;
  touchedIds: string[];
  savedAt: string;
  /** baseline לכל מוצר שנערך — לזיהוי Draft מיושן */
  baseLatestCountsByProduct: Record<string, CountDraftBaseCount>;
};

/** @deprecated v1 ללא baseline — מתייחס כ-stale */
export type CountDraftPayloadV1 = {
  version: 1;
  locationId: string;
  countDate: string;
  actualById: Record<string, string>;
  workerQtyByProduct: Record<string, Record<string, string>>;
  touchedIds: string[];
  savedAt: string;
};

export type CountDraftPayload = CountDraftPayloadV2 | CountDraftPayloadV1;

const STORAGE_PREFIX = "wego:inventory-count-draft:";

export function countDraftStorageKey(locationId: string, countDate: string): string {
  return `${STORAGE_PREFIX}${locationId.trim()}:${countDate.trim()}`;
}

export function loadCountDraft(locationId: string, countDate: string): CountDraftPayload | null {
  if (typeof window === "undefined") return null;
  const key = countDraftStorageKey(locationId, countDate);
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CountDraftPayload;
    if (
      !parsed ||
      parsed.locationId !== locationId.trim() ||
      parsed.countDate !== countDate.trim() ||
      (parsed.version !== 1 && parsed.version !== 2)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveCountDraft(payload: CountDraftPayloadV2): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      countDraftStorageKey(payload.locationId, payload.countDate),
      JSON.stringify(payload),
    );
  } catch {
    /* quota / private mode */
  }
}

export function clearCountDraft(locationId: string, countDate: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(countDraftStorageKey(locationId, countDate));
  } catch {
    /* ignore */
  }
}

export type DraftStaleCheckProduct = {
  id: string;
  latestCountId?: string | null;
  latestCountCreatedAt?: string | null;
};

/** Draft v1 או baseline שהשתנה → stale */
export function isCountDraftStale(
  draft: CountDraftPayload,
  products: DraftStaleCheckProduct[],
): boolean {
  if (draft.version !== 2) return true;
  const v2 = draft as CountDraftPayloadV2;
  const byId = new Map(products.map((p) => [p.id, p]));
  for (const pid of v2.touchedIds) {
    const base = v2.baseLatestCountsByProduct[pid];
    const current = byId.get(pid);
    if (!base || !current?.latestCountId) {
      if (base?.countId && !current?.latestCountId) return true;
      continue;
    }
    if (current.latestCountId !== base.countId) return true;
    if (
      current.latestCountCreatedAt &&
      base.createdAt &&
      current.latestCountCreatedAt !== base.createdAt
    ) {
      return true;
    }
  }
  return false;
}

export function buildBaseCountsFromProducts(
  products: DraftStaleCheckProduct[],
): Record<string, CountDraftBaseCount> {
  const out: Record<string, CountDraftBaseCount> = {};
  for (const p of products) {
    if (!p.latestCountId) continue;
    out[p.id] = {
      countId: p.latestCountId,
      createdAt: p.latestCountCreatedAt ?? "",
    };
  }
  return out;
}
