/**
 * Draft מקומי לספירה — לא נוגע ב־DB.
 * מפתח: locationId + יום ספירה עסקי (בידוד מיקומים).
 *
 * v3 = אחרי Stepper Safety Fix ("" ≠ "0").
 * v1/v2 = טיוטות ישנות — לא לשחזר כמויות אוטומטית לטופס.
 */

export const CURRENT_COUNT_DRAFT_VERSION = 3 as const;

export type CountDraftBaseCount = {
  countId: string;
  createdAt: string;
};

export type CountDraftPayloadV3 = {
  version: 3;
  locationId: string;
  countDate: string;
  actualById: Record<string, string>;
  workerQtyByProduct: Record<string, Record<string, string>>;
  touchedIds: string[];
  savedAt: string;
  /** baseline לכל מוצר שנערך — לזיהוי Draft מיושן */
  baseLatestCountsByProduct: Record<string, CountDraftBaseCount>;
};

/** @deprecated לפני Stepper Safety — לא לשחזר כמויות */
export type CountDraftPayloadV2 = {
  version: 2;
  locationId: string;
  countDate: string;
  actualById: Record<string, string>;
  workerQtyByProduct: Record<string, Record<string, string>>;
  touchedIds: string[];
  savedAt: string;
  baseLatestCountsByProduct: Record<string, CountDraftBaseCount>;
};

/** @deprecated v1 ללא baseline — מתייחס כ-stale / legacy */
export type CountDraftPayloadV1 = {
  version: 1;
  locationId: string;
  countDate: string;
  actualById: Record<string, string>;
  workerQtyByProduct: Record<string, Record<string, string>>;
  touchedIds: string[];
  savedAt: string;
};

export type CountDraftPayload =
  | CountDraftPayloadV3
  | CountDraftPayloadV2
  | CountDraftPayloadV1;

const STORAGE_PREFIX = "wego:inventory-count-draft:";

export function countDraftStorageKey(locationId: string, countDate: string): string {
  return `${STORAGE_PREFIX}${locationId.trim()}:${countDate.trim()}`;
}

export function isCurrentDraftVersion(
  draft: CountDraftPayload,
): draft is CountDraftPayloadV3 {
  return draft.version === CURRENT_COUNT_DRAFT_VERSION;
}

/** טיוטה מלפני Safety Fix — לא להכניס ערכים לטופס */
export function isLegacyCountDraft(draft: CountDraftPayload): boolean {
  return draft.version === 1 || draft.version === 2;
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
      (parsed.version !== 1 && parsed.version !== 2 && parsed.version !== 3)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveCountDraft(payload: CountDraftPayloadV3): void {
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

/**
 * Draft ניתן לשחזור רק בגרסה הנוכחית + baseline תואם.
 * v1/v2 → תמיד «לא לשחזר» (stale/legacy).
 */
export function isCountDraftStale(
  draft: CountDraftPayload,
  products: DraftStaleCheckProduct[],
): boolean {
  if (draft.version !== CURRENT_COUNT_DRAFT_VERSION) return true;
  const v3 = draft as CountDraftPayloadV3;
  const byId = new Map(products.map((p) => [p.id, p]));
  for (const pid of v3.touchedIds) {
    const base = v3.baseLatestCountsByProduct[pid];
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

/** האם מותר להציע שחזור כמויות לטופס */
export function canOfferDraftRestore(
  draft: CountDraftPayload,
  products: DraftStaleCheckProduct[],
): boolean {
  return isCurrentDraftVersion(draft) && !isCountDraftStale(draft, products);
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
