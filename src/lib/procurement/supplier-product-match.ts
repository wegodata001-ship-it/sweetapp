import { normalizeSimilarityText, stringSimilarity } from "@/lib/document-scan/similarity";

export type SupplierProductRow = {
  id: string;
  productName: string;
  regularPrice: number;
  notes: string | null;
  lastPrice: number | null;
};

const BARCODE_RE = /\b(\d{8,14})\b/;

/** מחלץ ברקוד מטקסט שורה (שם פריט / הערות). */
export function extractBarcode(text: string): string | null {
  const trimmed = text.trim();
  if (/^\d{8,14}$/.test(trimmed)) return trimmed;
  const m = trimmed.match(BARCODE_RE);
  return m?.[1] ?? null;
}

function notesContainBarcode(notes: string | null, barcode: string): boolean {
  if (!notes?.trim()) return false;
  return notes.includes(barcode);
}

export type SupplierProductMatch = {
  product: SupplierProductRow;
  score: number;
  matchedBy: "barcode" | "exact_name" | "fuzzy_name";
};

/**
 * התאמת פריט סרוק לשורת מחירון ספק — ברקוד (שם / notes) או שם מנורמל / fuzzy.
 */
export function matchSupplierProduct(
  itemName: string,
  catalog: SupplierProductRow[],
  minFuzzyScore = 0.55,
): SupplierProductMatch | null {
  const name = itemName.trim();
  if (!name || catalog.length === 0) return null;

  const barcode = extractBarcode(name);
  if (barcode) {
    for (const row of catalog) {
      if (normalizeSimilarityText(row.productName) === normalizeSimilarityText(barcode)) {
        return { product: row, score: 1, matchedBy: "barcode" };
      }
      if (notesContainBarcode(row.notes, barcode)) {
        return { product: row, score: 1, matchedBy: "barcode" };
      }
    }
  }

  const normalizedName = normalizeSimilarityText(name);
  for (const row of catalog) {
    if (normalizeSimilarityText(row.productName) === normalizedName) {
      return { product: row, score: 1, matchedBy: "exact_name" };
    }
  }

  let best: SupplierProductMatch | null = null;
  for (const row of catalog) {
    const score = stringSimilarity(name, row.productName);
    if (score >= minFuzzyScore && (best === null || score > best.score)) {
      best = { product: row, score, matchedBy: "fuzzy_name" };
    }
  }
  return best;
}

export type PriceCompareStatus = "new" | "unchanged" | "increased" | "decreased";

const PRICE_MATCH_EPS = 0.02;
const PRICE_MATCH_RATIO = 0.005;

export function compareUnitPrice(
  newPrice: number,
  baseline: number | null,
): { status: PriceCompareStatus; deltaAmount: number | null; deltaPercent: number | null } {
  if (baseline == null || baseline <= 0 || !Number.isFinite(newPrice) || newPrice <= 0) {
    return { status: "unchanged", deltaAmount: null, deltaPercent: null };
  }

  const delta = Math.round((newPrice - baseline) * 100) / 100;
  const ratio = Math.abs(delta) / baseline;

  if (Math.abs(delta) <= PRICE_MATCH_EPS || ratio < PRICE_MATCH_RATIO) {
    return { status: "unchanged", deltaAmount: 0, deltaPercent: 0 };
  }
  if (delta > 0) {
    return {
      status: "increased",
      deltaAmount: delta,
      deltaPercent: Math.round(ratio * 1000) / 10,
    };
  }
  return {
    status: "decreased",
    deltaAmount: delta,
    deltaPercent: Math.round(ratio * 1000) / 10,
  };
}

export function baselinePriceForProduct(row: SupplierProductRow): number | null {
  const last = row.lastPrice;
  if (last != null && last > 0) return last;
  if (row.regularPrice > 0) return row.regularPrice;
  return null;
}

export type PriceCompareSummary = {
  unchanged: number;
  newItems: number;
  increased: number;
  decreased: number;
  total: number;
};

export function summarizePriceCompare(
  statuses: PriceCompareStatus[],
): PriceCompareSummary {
  const summary: PriceCompareSummary = {
    unchanged: 0,
    newItems: 0,
    increased: 0,
    decreased: 0,
    total: statuses.length,
  };
  for (const s of statuses) {
    if (s === "new") summary.newItems++;
    else if (s === "unchanged") summary.unchanged++;
    else if (s === "increased") summary.increased++;
    else if (s === "decreased") summary.decreased++;
  }
  return summary;
}
