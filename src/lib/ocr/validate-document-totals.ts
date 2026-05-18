import type { ScannedDocument } from "./types";

const MAX_REASONABLE_TOTAL = 500_000;
const MISMATCH_WARN_RATIO = 0.12;
const MISMATCH_SUSPECT_RATIO = 0.35;

export type TotalValidationResult = {
  totalSuspect: boolean;
  itemsSum: number;
  mismatchRatio: number | null;
};

export function sumLineItems(
  items: ScannedDocument["items"],
): number {
  return items.reduce(
    (s, i) => s + (i.lineTotal > 0 ? i.lineTotal : i.quantity * i.unitPrice),
    0,
  );
}

/**
 * Detect absurd or mismatched invoice totals (e.g. 268,000 vs Σ lines ≈ 1,700).
 */
export function validateDocumentTotals(
  doc: Pick<ScannedDocument, "total" | "items" | "vatAmount">,
): TotalValidationResult {
  const itemsSum = sumLineItems(doc.items);
  const total = doc.total;

  if (total == null || !Number.isFinite(total) || total <= 0) {
    return { totalSuspect: false, itemsSum, mismatchRatio: null };
  }

  if (total > MAX_REASONABLE_TOTAL) {
    return { totalSuspect: true, itemsSum, mismatchRatio: null };
  }

  if (itemsSum <= 0) {
    return { totalSuspect: false, itemsSum, mismatchRatio: null };
  }

  const mismatchRatio = Math.abs(itemsSum - total) / Math.max(total, itemsSum, 1);

  const vat = doc.vatAmount ?? 0;
  const withVat = itemsSum + (vat > 0 ? vat : 0);
  const ratioWithVat =
    vat > 0
      ? Math.abs(withVat - total) / Math.max(total, withVat, 1)
      : mismatchRatio;

  const effectiveRatio = Math.min(mismatchRatio, ratioWithVat);

  const totalSuspect =
    effectiveRatio >= MISMATCH_SUSPECT_RATIO ||
    (effectiveRatio >= MISMATCH_WARN_RATIO && total > itemsSum * 2.5) ||
    (total > itemsSum * 8 && itemsSum > 50);

  return { totalSuspect, itemsSum, mismatchRatio: effectiveRatio };
}

export function applyTotalValidation(
  doc: ScannedDocument,
): ScannedDocument {
  const v = validateDocumentTotals(doc);
  if (!v.totalSuspect) return doc;

  let confidence = doc.confidence;
  if (v.mismatchRatio != null && v.mismatchRatio >= MISMATCH_SUSPECT_RATIO) {
    confidence = Math.min(confidence, 0.35);
  } else {
    confidence = Math.min(confidence, 0.55);
  }

  return {
    ...doc,
    totalSuspect: true,
    itemsSumDetected: v.itemsSum,
    confidence,
  };
}
