import type { GeminiZReportJson } from "./gemini-z-report";

function pickFirst(...values: Array<string | null | undefined>): string | null {
  for (const v of values) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function pickLastMoney(...values: Array<number | null | undefined>): number | null {
  let last: number | null = null;
  for (const v of values) {
    if (v != null && Number.isFinite(v)) last = v;
  }
  return last;
}

/** מיזוג תוצאות דוח Z ממספר עמודים */
export function mergeGeminiZReports(pages: GeminiZReportJson[]): GeminiZReportJson {
  if (pages.length === 0) {
    return {
      zNumber: null,
      date: null,
      cashTaxable: null,
      cashExempt: null,
      creditTaxable: null,
      creditExempt: null,
      transfers: null,
      grandTotal: null,
    };
  }
  if (pages.length === 1) return pages[0]!;

  return {
    zNumber: pickFirst(...pages.map((p) => p.zNumber)),
    date: pickFirst(...pages.map((p) => p.date)),
    cashTaxable: pickLastMoney(...pages.map((p) => p.cashTaxable)),
    cashExempt: pickLastMoney(...pages.map((p) => p.cashExempt)),
    creditTaxable: pickLastMoney(...pages.map((p) => p.creditTaxable)),
    creditExempt: pickLastMoney(...pages.map((p) => p.creditExempt)),
    transfers: pickLastMoney(...pages.map((p) => p.transfers)),
    grandTotal: pickLastMoney(...pages.map((p) => p.grandTotal)),
  };
}
