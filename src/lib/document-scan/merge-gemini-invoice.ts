import type { GeminiInvoiceJson } from "./gemini-vision";

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

function lineItemKey(item: GeminiInvoiceJson["lineItems"][number]): string {
  return [
    item.name?.trim().toLowerCase() ?? "",
    item.quantity ?? "",
    item.unitPrice ?? "",
    item.lineTotal ?? "",
  ].join("|");
}

/** מיזוג תוצאות מספר עמודים למסמך פיננסי אחד */
export function mergeGeminiInvoices(pages: GeminiInvoiceJson[]): GeminiInvoiceJson {
  if (pages.length === 0) {
    return {
      supplier: null,
      invoiceNumber: null,
      date: null,
      subtotal: null,
      vat: null,
      total: null,
      documentType: null,
      lineItems: [],
    };
  }
  if (pages.length === 1) return pages[0]!;

  const lineItems: GeminiInvoiceJson["lineItems"] = [];
  const seen = new Set<string>();
  for (const page of pages) {
    for (const item of page.lineItems) {
      const key = lineItemKey(item);
      if (seen.has(key)) continue;
      seen.add(key);
      lineItems.push(item);
    }
  }

  return {
    supplier: pickFirst(...pages.map((p) => p.supplier)),
    invoiceNumber: pickFirst(...pages.map((p) => p.invoiceNumber)),
    date: pickFirst(...pages.map((p) => p.date)),
    documentType: pickFirst(...pages.map((p) => p.documentType)),
    subtotal: pickLastMoney(...pages.map((p) => p.subtotal)),
    vat: pickLastMoney(...pages.map((p) => p.vat)),
    total: pickLastMoney(...pages.map((p) => p.total)),
    lineItems,
  };
}
