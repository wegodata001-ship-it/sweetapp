import { VAT_RATE } from "@/lib/finance/document-payload";

export type VatRateRule = { effectiveFrom: string; rate: number };

/**
 * Statutory rate by the date it took effect.
 * The current system rate is the only row until a real change is recorded.
 * Older documents keep the rate whose effectiveFrom is on or before their date.
 */
export const VAT_RATE_SCHEDULE: VatRateRule[] = [
  { effectiveFrom: "1970-01-01", rate: VAT_RATE },
];

export function vatRateOn(isoDate: string, schedule: VatRateRule[] = VAT_RATE_SCHEDULE): number {
  const day = isoDate.slice(0, 10);
  let rate = schedule[0]?.rate ?? VAT_RATE;
  const ordered = [...schedule].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  for (const rule of ordered) {
    if (rule.effectiveFrom <= day) rate = rule.rate;
  }
  return rate;
}
