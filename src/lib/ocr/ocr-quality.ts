import { hebrewLetterRatio, isOcrGarbageText } from "./normalize-hebrew-ocr";

function hasMeaningfulText(text: string): boolean {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length < 8) return false;
  const letters = cleaned.match(/[a-zA-Z\u0590-\u05FF\u0600-\u06FF]/g);
  return (letters?.length ?? 0) >= 6;
}

export function computeGarbageRatio(text: string): number {
  const tokens = text.split(/\s+/).filter((t) => t.length > 0);
  if (tokens.length === 0) return 1;
  const garbage = tokens.filter((t) => isOcrGarbageText(t)).length;
  return garbage / tokens.length;
}

/** Merge engine confidence with text-quality heuristics. */
export function mergeOcrConfidence(engineConfidence: number, text: string): number {
  let c = Math.min(1, Math.max(0, engineConfidence));
  const garbage = computeGarbageRatio(text);
  const heb = hebrewLetterRatio(text);

  if (garbage > 0.35) c *= 0.45;
  else if (garbage > 0.2) c *= 0.7;

  if (text.length > 40 && heb < 0.08 && /[a-z]{4,}/i.test(text)) c *= 0.65;

  if (!hasMeaningfulText(text)) c = Math.min(c, 0.2);

  return Math.round(c * 1000) / 1000;
}

export function ocrNeedsManualReview(confidence: number, text: string): boolean {
  if (!hasMeaningfulText(text)) return true;
  if (confidence < 0.42) return true;
  if (computeGarbageRatio(text) > 0.38) return true;
  return false;
}
