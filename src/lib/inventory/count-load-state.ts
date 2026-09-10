/**
 * מצבי טעינת מסך ספירה — מונע מראה של «מלאי מאופס» בכשל GET.
 */

export type CountLoadPhase = "loading" | "loaded" | "error";

export type LoadFailureDisposition =
  | "initial_error"
  | "preserve_block_save";

/** בכשל טעינה — אף פעם לא מנקים כמויות ל־{} / [] כאילו אין מלאי */
export function shouldClearFormOnLoadFailure(): boolean {
  return false;
}

export function dispositionForLoadFailure(hadSuccessfulLoad: boolean): LoadFailureDisposition {
  return hadSuccessfulLoad ? "preserve_block_save" : "initial_error";
}

export function canSaveWithLoadGuards(args: {
  loadPhase: CountLoadPhase;
  baselineValidated: boolean;
}): boolean {
  return args.loadPhase === "loaded" && args.baselineValidated;
}

/** האם להציג רשימה ריקה כ«אין מלאי» — לא במצב שגיאת טעינה ראשונית */
export function shouldShowEmptyInventoryMessage(args: {
  loadPhase: CountLoadPhase;
  productCount: number;
}): boolean {
  if (args.loadPhase !== "loaded") return false;
  return args.productCount === 0;
}

export function shouldShowInitialLoadError(args: {
  loadPhase: CountLoadPhase;
  hadSuccessfulLoad: boolean;
}): boolean {
  return args.loadPhase === "error" && !args.hadSuccessfulLoad;
}
