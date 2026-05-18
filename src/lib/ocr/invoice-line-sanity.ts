/**
 * Numeric sanity for invoice line items.
 */

export const SANITY_MAX_QTY = 1000;
export const SANITY_MAX_UNIT_PRICE = 100_000;
export const SANITY_MAX_LINE_TOTAL = 100_000;
/** Typical retail line — above this without strong math fit → suspect */
export const SANITY_TYPICAL_LINE_TOTAL = 15_000;

export type LineTriple = {
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

export function tripleMathError(q: number, p: number, t: number): number {
  const expected = q * p;
  return Math.abs(expected - t) / Math.max(t, expected, 1);
}

/** e.g. 55 × 576 = 31680 when real row might be 16 × 5.31 ≈ 85 */
export function isUnreasonableTriple(
  q: number,
  p: number,
  t: number,
  minFitScore = 0.55,
): boolean {
  if (q <= 0 || p <= 0 || t <= 0) return true;
  const err = tripleMathError(q, p, t);
  if (err <= 0.08) return false;

  const product = q * p;
  if (product > SANITY_TYPICAL_LINE_TOTAL && err > 0.2) return true;
  if (product > SANITY_MAX_LINE_TOTAL * 0.5 && err > 0.35) return true;
  if (q > 50 && p > 200 && err > minFitScore) return true;
  return err > 0.45;
}

export function violatesNumericCaps(
  q: number,
  p: number,
  t: number,
  parseConfidence: number,
): boolean {
  const highConf = parseConfidence >= 0.82;
  if (q > SANITY_MAX_QTY && !highConf) return true;
  if (p > SANITY_MAX_UNIT_PRICE && !highConf) return true;
  if (t > SANITY_MAX_LINE_TOTAL && !highConf) return true;
  return false;
}

export function scoreTripleConfidence(q: number, p: number, t: number): number {
  if (isUnreasonableTriple(q, p, t)) return 0.28;
  const err = tripleMathError(q, p, t);
  if (err <= 0.02) return 0.95;
  if (err <= 0.06) return 0.84;
  if (err <= 0.12) return 0.68;
  if (err <= 0.2) return 0.52;
  return 0.38;
}
