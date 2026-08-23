/**
 * מנגנון "ספירה אחרונה" — מקור אמת יחיד לכל שאילתות latest.
 * חשוב: countDate לעיתים date-only (אותו יום = אותו timestamp) → חובה tie-break עם createdAt/id.
 *
 * כלל עסקי:
 * - Location Inventory = לפי (productId + locationId) בלבד
 * - Global Inventory = SUM רק בדוחות כלל־עסקיים
 */

export const LATEST_COUNT_ORDER_BY = [
  { createdAt: "desc" as const },
  { countDate: "desc" as const },
  { id: "desc" as const },
];

/** סדר אחיד לכל מקומות האחסון במערכת */
export const LOCATION_ORDER_BY = [
  { displayOrder: "asc" as const },
  { name: "asc" as const },
];

export type LatestCountQty = {
  inventoryProductId: string;
  locationId: string | null;
  currentQuantity: number;
  countDate: Date;
  createdAt?: Date;
  id?: string;
};

/**
 * סה״כ מלאי בכל העסק = סכום הספירה האחרונה בכל מיקום.
 * לשימוש בדוחות גלובליים בלבד — לא במסך ספירה של Location בודד.
 */
export function systemTotalFromCounts(
  counts: { locationId: string | null; currentQuantity: number }[],
): number {
  const hasLocationSpecific = counts.some((c) => c.locationId != null);
  const seen = new Set<string>();
  let total = 0;
  for (const c of counts) {
    if (hasLocationSpecific && c.locationId == null) continue;
    const key = c.locationId ?? "__legacy__";
    if (seen.has(key)) continue;
    seen.add(key);
    total += Number(c.currentQuantity || 0);
  }
  return total;
}

/** כמה חסר כדי להגיע למינימום — לעולם לא שלילי */
export function requiredQtyToMinimum(
  onHand: number,
  minimumQuantity: number,
): number {
  if (!(minimumQuantity > 0)) return 0;
  return Math.max(0, minimumQuantity - onHand);
}

/**
 * מינימום לפי מקום: placement גובר; fallback למינימום גלובלי ישן (BC).
 * לא יוצר תנועת מלאי — ערך התראה בלבד.
 */
export function resolveLocationMinimum(
  placementMinimum: number | null | undefined,
  productMinimum: number | null | undefined,
): number {
  if (placementMinimum != null && Number.isFinite(placementMinimum)) {
    return Math.max(0, Number(placementMinimum));
  }
  if (productMinimum != null && Number.isFinite(productMinimum)) {
    return Math.max(0, Number(productMinimum));
  }
  return 0;
}

/**
 * ברירת מחדל למינימום בפתיחת ספירה חדשה:
 * snapshot מהספירה האחרונה באותו מוצר+מיקום, אחרת placement/מוצר.
 * היסטוריה נשארת בשורות InventoryCount — לא כאן.
 */
export function resolveCountDefaultMinimum(opts: {
  lastCountMinimum: number | null | undefined;
  hasLastCountForLocation: boolean;
  placementMinimum: number | null | undefined;
  productMinimum: number | null | undefined;
}): number {
  if (opts.hasLastCountForLocation) {
    const snap = Number(opts.lastCountMinimum);
    if (Number.isFinite(snap)) return Math.max(0, snap);
  }
  return resolveLocationMinimum(opts.placementMinimum, opts.productMinimum);
}

export type LocationMinimumStatus = "ok" | "below" | "unset";

/** סטטוס מול מינימום המקום — לפי הכמות שנספרה (או on-hand אם אין ספירה) */
export function locationMinimumStatus(
  onHandOrCounted: number | null,
  minimumQuantity: number,
): { status: LocationMinimumStatus; shortage: number } {
  if (!(minimumQuantity > 0)) return { status: "unset", shortage: 0 };
  if (onHandOrCounted === null || !Number.isFinite(onHandOrCounted)) {
    return { status: "unset", shortage: 0 };
  }
  const shortage = requiredQtyToMinimum(onHandOrCounted, minimumQuantity);
  return {
    status: shortage > 0 ? "below" : "ok",
    shortage,
  };
}

/**
 * כמות אחרונה למיקום בודד.
 * לא מערבבים מיקומים: אם יש ספירה עם locationId כלשהו — לא משתמשים ב־legacy עבור מיקום אחר.
 * fallback ל־locationId=null רק כשאין בכלל ספירות עם locationId (היסטוריה ישנה).
 */
export function previousQtyFromCounts(
  counts: { locationId: string | null; currentQuantity: number }[],
  locationId: string | null,
): number {
  if (locationId) {
    const atLocation = counts.find((c) => c.locationId === locationId);
    if (atLocation) return Number(atLocation.currentQuantity || 0);
    const hasAnyLocationCount = counts.some((c) => c.locationId != null);
    if (hasAnyLocationCount) return 0;
    return Number(counts.find((c) => !c.locationId)?.currentQuantity || 0);
  }
  return Number(counts[0]?.currentQuantity || 0);
}

/** שורת הספירה האחרונה למיקום — בלי ערבוב ממיקום אחר */
export function pickLatestCountForLocation<
  T extends { locationId: string | null },
>(counts: T[], locationId: string | null): T | null {
  if (locationId) {
    const atLocation = counts.find((c) => c.locationId === locationId) ?? null;
    if (atLocation) return atLocation;
    const hasAnyLocationCount = counts.some((c) => c.locationId != null);
    if (hasAnyLocationCount) return null;
    return counts.find((c) => !c.locationId) ?? null;
  }
  return counts[0] ?? null;
}
