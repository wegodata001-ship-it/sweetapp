/**
 * מנגנון "ספירה אחרונה" — מקור אמת יחיד לכל שאילתות latest.
 * חשוב: countDate לעיתים date-only (אותו יום = אותו timestamp) → חובה tie-break עם createdAt/id.
 */

export const LATEST_COUNT_ORDER_BY = [
  { createdAt: "desc" as const },
  { countDate: "desc" as const },
  { id: "desc" as const },
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
 * סה״כ מלאי במערכת = סכום הספירה האחרונה בכל מיקום.
 * אם קיימות ספירות עם locationId — מתעלמים משורות legacy (locationId=null) כדי למנוע כפילות.
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
  systemTotal: number,
  minimumQuantity: number,
): number {
  if (!(minimumQuantity > 0)) return 0;
  return Math.max(0, minimumQuantity - systemTotal);
}

export function previousQtyFromCounts(
  counts: { locationId: string | null; currentQuantity: number }[],
  locationId: string | null,
): number {
  if (locationId) {
    return (
      counts.find((c) => c.locationId === locationId)?.currentQuantity ??
      counts.find((c) => !c.locationId)?.currentQuantity ??
      0
    );
  }
  return counts[0]?.currentQuantity ?? 0;
}
