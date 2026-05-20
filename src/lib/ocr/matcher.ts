import { prisma } from "@/lib/prisma";
import { stringSimilarity } from "./similarity";
import { canAutoMatchProductName } from "./ocr-line-filters";
import { supplierMatchLabels, supplierNamesMatch } from "./supplier-aliases";
import type { ScannedDocument, ScannedItem } from "./types";

type SupplierRow = { id: string; name: string; notes: string | null };

let supplierFuseCache: {
  search: (q: string) => Array<{ item: SupplierRow; score?: number }>;
  at: number;
} | null = null;
const FUSE_CACHE_MS = 60_000;

async function fuseSearchSuppliers(clean: string): Promise<{ id: string; name: string } | null> {
  try {
    const now = Date.now();
    if (!supplierFuseCache || now - supplierFuseCache.at > FUSE_CACHE_MS) {
      const Fuse = (await import("fuse.js")).default;
      const rows = await prisma.supplier.findMany({
        select: { id: true, name: true, notes: true },
      });
      const fuse = new Fuse(rows, {
        keys: ["name"],
        threshold: 0.45,
        ignoreLocation: true,
        distance: 120,
        minMatchCharLength: 2,
      });
      supplierFuseCache = {
        at: now,
        search: (q) => fuse.search(q),
      };
    }
    const hits = supplierFuseCache.search(clean);
    const best = hits[0];
    if (best && best.score != null && best.score <= 0.38) {
      return { id: best.item.id, name: best.item.name };
    }
  } catch (e) {
    console.warn("[MATCHER] fuse.js unavailable — run npm install fuse.js", e);
  }
  return null;
}

/**
 * Supplier + product matching and price-baseline comparison.
 *
 * No new tables are introduced — the regular-price baseline is built from
 * historical `FinancialDocumentItem` rows belonging to expense documents,
 * which we already write on every save. This gives us a self-tuning baseline
 * that improves automatically as more data is recorded.
 *
 * The comparison threshold is configurable via `PRICE_FLAG_THRESHOLD`
 * (default 15 %).
 */

const PRICE_FLAG_THRESHOLD = 0.15;
const MIN_SAMPLES_FOR_BASELINE = 1;

/** Strip punctuation and noise so we can compare strings loosely. */
function normalize(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u0591-\u05C7\u064B-\u0652]/g, "") // Hebrew/Arabic diacritics
    .replace(/[\.,'"„“”`׳״\-_/()[\]{}!?:;]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Tokenize and drop very short / numeric noise tokens. */
function tokens(s: string): string[] {
  return normalize(s)
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !/^\d+$/.test(t));
}

/**
 * Jaccard token similarity in [0,1]. Returns 1 for identical normalized
 * strings, 0 when no token overlap.
 */
function similarity(a: string, b: string): number {
  const A = new Set(tokens(a));
  const B = new Set(tokens(b));
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  const union = A.size + B.size - inter;
  return union > 0 ? inter / union : 0;
}

/** True when one string fully contains the other after normalization. */
function containsFuzzy(a: string, b: string): boolean {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return false;
  return na.includes(nb) || nb.includes(na);
}

export async function matchSupplier(
  rawName: string,
): Promise<{ id: string; name: string } | null> {
  const clean = rawName.trim();
  if (!clean) return null;

  const fuseHit = await fuseSearchSuppliers(clean);
  if (fuseHit) return fuseHit;

  const suppliers = await prisma.supplier.findMany({
    select: { id: true, name: true, notes: true },
  });
  let best: { id: string; name: string; score: number } | null = null;
  for (const s of suppliers) {
    let score = Math.max(similarity(s.name, clean), stringSimilarity(s.name, clean));
    if (containsFuzzy(s.name, clean)) score = Math.max(score, 0.78);
    if (normalize(s.name) === normalize(clean)) score = 1;
    for (const label of supplierMatchLabels(s.name, s.notes)) {
      if (supplierNamesMatch(label, clean)) score = Math.max(score, 0.92);
      score = Math.max(score, stringSimilarity(label, clean));
      if (containsFuzzy(label, clean)) score = Math.max(score, 0.85);
    }
    if (score >= 0.72 && (best === null || score > best.score)) {
      best = { id: s.id, name: s.name, score };
    }
  }
  return best ? { id: best.id, name: best.name } : null;
}

/** Rank suppliers for "exists under different name" UI (Levenshtein + token fuzzy). */
export async function rankSupplierSuggestions(ocrName: string, limit = 8) {
  const clean = ocrName.trim();
  if (!clean) return [];
  const suppliers = await prisma.supplier.findMany({
    select: { id: true, name: true, phone: true, notes: true },
    orderBy: { name: "asc" },
  });
  const ranked: { id: string; name: string; phone: string | null; score: number }[] = [];
  for (const s of suppliers) {
    let score = stringSimilarity(clean, s.name);
    for (const label of supplierMatchLabels(s.name, s.notes)) {
      if (supplierNamesMatch(label, clean)) score = Math.max(score, 0.92);
      score = Math.max(score, stringSimilarity(clean, label));
      if (containsFuzzy(label, clean)) score = Math.max(score, 0.8);
    }
    if (score >= 0.38) ranked.push({ id: s.id, name: s.name, phone: s.phone, score });
  }
  ranked.sort((a, b) => b.score - a.score);
  return ranked.slice(0, limit);
}

async function matchProduct(
  rawName: string,
): Promise<{ id: string; name: string } | null> {
  const clean = rawName.trim();
  if (!clean) return null;
  // Pull all products for fuzzy matching. The catalog is small (hundreds at
  // most for our use case); fetching everything once per scan is fine.
  const products = await prisma.product.findMany({
    select: { id: true, name: true },
    take: 5000,
  });
  let best: { id: string; name: string; score: number } | null = null;
  for (const p of products) {
    let score = similarity(p.name, clean);
    if (containsFuzzy(p.name, clean)) score = Math.max(score, 0.65);
    if (normalize(p.name) === normalize(clean)) score = 1;
    if (score >= 0.48 && (best === null || score > best.score)) {
      best = { id: p.id, name: p.name, score };
    }
  }
  return best ? { id: best.id, name: best.name } : null;
}

async function findSimilarCatalogProduct(
  supplierId: string,
  rawName: string,
): Promise<{ supplierProductId: string; name: string; score: number } | null> {
  const clean = rawName.trim();
  if (!clean) return null;
  const rows = await prisma.supplierProduct.findMany({
    where: { supplierId },
    select: { id: true, productName: true, regularPrice: true },
  });
  let best: { supplierProductId: string; name: string; score: number } | null = null;
  for (const row of rows) {
    const score = Math.max(
      stringSimilarity(row.productName, clean),
      similarity(row.productName, clean),
    );
    if (score >= 0.48 && (best === null || score > best.score)) {
      best = { supplierProductId: row.id, name: row.productName, score };
    }
  }
  return best;
}

/**
 * Compute a price baseline for a product name from past expense documents.
 *
 * Uses the median to be robust to outliers (one mislabelled invoice should
 * not skew the baseline). Returns `null` when there are no samples.
 *
 * The baseline is supplier-agnostic by default; pass `supplierName` to scope
 * to documents whose counterparty matches (best-effort fuzzy match on the
 * document title — which we always set to "<docType> — <counterparty>").
 */
/** מחיר רגיל ממחירון הספק (SupplierProduct) */
async function supplierCatalogBaseline(
  supplierId: string,
  rawProductName: string,
): Promise<{ price: number; samples: number; supplierProductId: string; catalogName: string } | null> {
  const clean = rawProductName.trim();
  if (!clean) return null;
  const rows = await prisma.supplierProduct.findMany({
    where: { supplierId },
    select: { id: true, productName: true, regularPrice: true },
  });
  let best: { id: string; productName: string; regularPrice: number; score: number } | null = null;
  for (const row of rows) {
    let score = similarity(row.productName, clean);
    if (containsFuzzy(row.productName, clean)) score = Math.max(score, 0.78);
    if (tokens(clean).length >= 2 && tokens(row.productName).some((t) => clean.includes(t))) {
      score = Math.max(score, 0.65);
    }
    if (normalize(row.productName) === normalize(clean)) score = 1;
    if (score >= 0.48 && (best === null || score > best.score)) {
      best = { id: row.id, productName: row.productName, regularPrice: row.regularPrice, score };
    }
  }
  if (!best || best.regularPrice <= 0) return null;
  return {
    price: best.regularPrice,
    samples: 1,
    supplierProductId: best.id,
    catalogName: best.productName,
  };
}

async function priceBaseline(
  productName: string,
  supplierName?: string | null,
): Promise<{ price: number; samples: number } | null> {
  if (!productName.trim()) return null;
  const since = new Date();
  since.setMonth(since.getMonth() - 18);

  const rows = await prisma.financialDocumentItem.findMany({
    where: {
      itemName: productName,
      document: {
        category: "הוצאה",
        ...(supplierName
          ? { title: { contains: supplierName.trim(), mode: "insensitive" } }
          : {}),
      },
    },
    select: {
      unitPrice: true,
      document: { select: { docDate: true, createdAt: true } },
    },
    take: 200,
  });

  const recent = rows
    .filter((r) => r.unitPrice > 0)
    .filter((r) => {
      const d = r.document?.docDate ?? r.document?.createdAt ?? null;
      if (!d) return true;
      return new Date(d) >= since;
    })
    .map((r) => r.unitPrice);

  if (recent.length < MIN_SAMPLES_FOR_BASELINE) {
    // Fallback to the supplier-agnostic baseline so we still surface a hint
    // even when this is the first invoice from that supplier.
    if (supplierName) return priceBaseline(productName, null);
    return null;
  }
  recent.sort((a, b) => a - b);
  const mid = Math.floor(recent.length / 2);
  const median =
    recent.length % 2 === 0
      ? (recent[mid - 1] + recent[mid]) / 2
      : recent[mid];
  return { price: median, samples: recent.length };
}

function compareItemPrice(item: ScannedItem, baseline: number): ScannedItem {
  if (!Number.isFinite(baseline) || baseline <= 0) return item;
  const ratio = (item.unitPrice - baseline) / baseline;
  const priceDifferencePercent = Math.round(ratio * 1000) / 10;
  if (ratio >= PRICE_FLAG_THRESHOLD) {
    return {
      ...item,
      isHigher: true,
      isLower: false,
      priceFlagKey: "higher",
      priceDifferencePercent,
    };
  }
  if (ratio <= -PRICE_FLAG_THRESHOLD) {
    return {
      ...item,
      isHigher: false,
      isLower: true,
      priceFlagKey: "lower",
      priceDifferencePercent,
    };
  }
  return {
    ...item,
    isHigher: false,
    isLower: false,
    priceFlagKey: "match",
    priceDifferencePercent,
  };
}

/**
 * Resolve all parsed items against the product catalog and tag each with a
 * regular-price baseline + over/under flags.
 *
 * Also attempts to resolve the supplier from `doc.supplierRawName`. Mutates a
 * shallow copy of the input document and returns it.
 */
export async function enrichScannedDocument(
  doc: ScannedDocument,
): Promise<ScannedDocument> {
  const result: ScannedDocument = { ...doc };

  const supplier = await matchSupplier(doc.supplierRawName);
  if (supplier) {
    result.supplierId = supplier.id;
    result.supplierName = supplier.name;
    result.suggestNewSupplier = false;
    result.suggestedSupplierId = null;
    result.suggestedSupplierName = null;
    result.supplierMatchScore = null;
  } else {
    result.supplierId = null;
    result.supplierName = doc.supplierRawName;
    result.suggestNewSupplier = Boolean(doc.supplierRawName?.trim());
    result.suggestedSupplierId = null;
    result.suggestedSupplierName = null;
    result.supplierMatchScore = null;

    if (doc.supplierRawName?.trim()) {
      const suggestions = await rankSupplierSuggestions(doc.supplierRawName, 5);
      const top = suggestions[0];
      if (top && top.score >= 0.52) {
        result.suggestedSupplierId = top.id;
        result.suggestedSupplierName = top.name;
        result.supplierMatchScore = Math.round(top.score * 100) / 100;
      }
    }
  }

  const enriched: ScannedItem[] = [];
  for (const item of doc.items) {
    const allowAutoMatch =
      canAutoMatchProductName(item.rawName) &&
      item.lineStatus !== "suspect" &&
      !item.ocrSuspect &&
      (item.parseConfidence ?? item.confidenceScore ?? 0) >= 0.55;

    const productMatch = allowAutoMatch
      ? await matchProduct(item.rawName)
      : null;
    let name = productMatch?.name ?? item.rawName;
    const productId = productMatch?.id ?? null;

    let baselinePrice: number | null = null;
    let baselineSamples = 0;
    let supplierProductId: string | null = null;

    let suggestedProductId: string | null = null;
    let suggestedProductName: string | null = null;
    let productMatchScore: number | null = null;

    if (result.supplierId && allowAutoMatch) {
      const catalog = await supplierCatalogBaseline(result.supplierId, item.rawName);
      if (catalog) {
        baselinePrice = catalog.price;
        baselineSamples = catalog.samples;
        supplierProductId = catalog.supplierProductId;
        name = catalog.catalogName;
      } else {
        const similar = await findSimilarCatalogProduct(result.supplierId, item.rawName);
        if (similar && similar.score < 0.72) {
          suggestedProductId = similar.supplierProductId;
          suggestedProductName = similar.name;
          productMatchScore = similar.score;
        } else if (similar && similar.score >= 0.72) {
          supplierProductId = similar.supplierProductId;
          name = similar.name;
          const row = await prisma.supplierProduct.findUnique({
            where: { id: similar.supplierProductId },
            select: { regularPrice: true },
          });
          if (row && row.regularPrice > 0) {
            baselinePrice = row.regularPrice;
            baselineSamples = 1;
          }
        }
      }
    }

    if (baselinePrice == null) {
      const hist = await priceBaseline(name, result.supplierName);
      baselinePrice = hist?.price ?? null;
      baselineSamples = hist?.samples ?? 0;
    }

    let next: ScannedItem = {
      ...item,
      name,
      productId,
      supplierProductId,
      suggestedProductId,
      suggestedProductName,
      productMatchScore,
      regularPrice: baselinePrice,
      regularPriceSamples: baselineSamples,
      isHigher: false,
      isLower: false,
      priceFlagKey: null,
      priceDifferencePercent: null,
    };
    if (baselinePrice != null) {
      next = compareItemPrice(next, baselinePrice);
    }
    enriched.push(next);
  }
  result.items = enriched;

  return result;
}
