import type { FieldConfidenceTier, ScannedField } from "./types";

const NOT_DETECTED = "לא זוהה";

export function tierFromScore(score: number): FieldConfidenceTier {
  if (score >= 0.85) return "high";
  if (score >= 0.6) return "medium";
  if (score >= 0.4) return "low";
  return "none";
}

/** אם האמינות נמוכה מדי — לא מציגים ערך (לא ממציאים). */
export function buildStringField(
  value: string | null | undefined,
  score: number,
): ScannedField<string> {
  const tier = tierFromScore(score);
  const trimmed = value?.trim() ?? "";
  if (!trimmed || tier === "none" || tier === "low") {
    return {
      value: null,
      display: NOT_DETECTED,
      confidence: tier === "low" ? "low" : "none",
      confidencePercent: trimmed ? Math.round(score * 100) : null,
      detected: false,
    };
  }
  return {
    value: trimmed,
    display: trimmed,
    confidence: tier,
    confidencePercent: Math.round(score * 100),
    detected: true,
  };
}

export function buildMoneyField(
  value: number | null | undefined,
  score: number,
  format: (n: number) => string,
): ScannedField<number> {
  const tier = tierFromScore(score);
  if (value == null || !Number.isFinite(value) || value <= 0 || tier === "none" || tier === "low") {
    return {
      value: null,
      display: NOT_DETECTED,
      confidence: tier === "low" ? "low" : "none",
      confidencePercent: value != null && value > 0 ? Math.round(score * 100) : null,
      detected: false,
    };
  }
  return {
    value,
    display: format(value),
    confidence: tier,
    confidencePercent: Math.round(score * 100),
    detected: true,
  };
}

export function formatDisplayDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

export function formatShekelDisplay(n: number): string {
  return `₪${n.toLocaleString("he-IL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
