/**
 * ולידציה מפורשת לכמויות ספירה בשרת.
 * לא מסתמכים על Number(null)===0 או Number("")===0.
 */

export type StrictCountedQtyResult =
  | { ok: true; value: number }
  | { ok: false; reason: "missing" | "invalid" };

/**
 * כמות נקודת ספירה / שורה — רק מספר סופי >= 0.
 * 0 מפורש חוקי. null / undefined / "" / NaN → דחייה.
 */
export function parseStrictCountedQuantity(raw: unknown): StrictCountedQtyResult {
  if (raw === null || raw === undefined) {
    return { ok: false, reason: "missing" };
  }
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed === "") return { ok: false, reason: "missing" };
    const n = Number(trimmed);
    if (!Number.isFinite(n) || n < 0) return { ok: false, reason: "invalid" };
    return { ok: true, value: n };
  }
  if (typeof raw === "number") {
    if (!Number.isFinite(raw) || raw < 0) return { ok: false, reason: "invalid" };
    return { ok: true, value: raw };
  }
  return { ok: false, reason: "invalid" };
}

/** האם לשדה יש מפתח countedQuantity (גם אם הערך null) */
export function hasCountedQuantityKey(worker: {
  countedQuantity?: unknown;
}): boolean {
  return Object.prototype.hasOwnProperty.call(worker, "countedQuantity");
}
