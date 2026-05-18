/** OCR confidence tiers for UI coloring. */
export type ConfidenceTier = "high" | "medium" | "low";

export function confidenceTier(score: number | undefined | null): ConfidenceTier {
  const s = score ?? 0;
  if (s >= 0.75) return "high";
  if (s >= 0.5) return "medium";
  return "low";
}

export function confidenceBadgeClass(tier: ConfidenceTier): string {
  switch (tier) {
    case "high":
      return "border-emerald-300 bg-emerald-50 text-emerald-900";
    case "medium":
      return "border-amber-300 bg-amber-50 text-amber-900";
    default:
      return "border-red-300 bg-red-50 text-red-900";
  }
}

export function confidenceItemBorderClass(tier: ConfidenceTier): string {
  switch (tier) {
    case "high":
      return "border-emerald-300 bg-emerald-50/40";
    case "medium":
      return "border-amber-300 bg-amber-50/50";
    default:
      return "border-red-300 bg-red-50/60";
  }
}
