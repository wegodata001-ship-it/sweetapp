import type { ScannedDocument, ScannedItem } from "@/lib/document-scan/api-response";
import { rankSupplierSuggestions } from "@/lib/document-scan/supplier-suggestions";
import { prisma } from "@/lib/prisma";
import {
  baselinePriceForProduct,
  compareUnitPrice,
  matchSupplierProduct,
  summarizePriceCompare,
  type PriceCompareSummary,
  type SupplierProductRow,
} from "./supplier-product-match";

const SUPPLIER_AUTO_MATCH_SCORE = 0.92;

export type EnrichedExpenseScan = ScannedDocument & {
  priceCompareSummary?: PriceCompareSummary;
};

async function loadSupplierCatalog(supplierId: string): Promise<SupplierProductRow[]> {
  const rows = await prisma.supplierProduct.findMany({
    where: { supplierId },
    select: {
      id: true,
      productName: true,
      regularPrice: true,
      notes: true,
      priceHistory: {
        orderBy: { recordedAt: "desc" },
        take: 1,
        select: { price: true },
      },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    productName: row.productName,
    regularPrice: row.regularPrice,
    notes: row.notes,
    lastPrice: row.priceHistory[0]?.price ?? null,
  }));
}

function enrichItem(
  item: ScannedItem,
  catalog: SupplierProductRow[],
): ScannedItem {
  const name = (item.name || item.rawName || "").trim();
  const unitPrice = item.unitPrice;
  if (!name || !Number.isFinite(unitPrice) || unitPrice <= 0) {
    return { ...item, priceCompareStatus: "new" as const };
  }

  const match = matchSupplierProduct(name, catalog);
  if (!match) {
    return {
      ...item,
      priceCompareStatus: "new",
      priceFlagKey: null,
      supplierProductId: null,
      regularPrice: null,
    };
  }

  const baseline = baselinePriceForProduct(match.product);
  const { status, deltaAmount, deltaPercent } = compareUnitPrice(unitPrice, baseline);
  const priceCompareStatus = status;

  const priceFlagKey =
    priceCompareStatus === "increased"
      ? ("higher" as const)
      : priceCompareStatus === "decreased"
        ? ("lower" as const)
        : priceCompareStatus === "unchanged"
          ? ("match" as const)
          : null;

  return {
    ...item,
    name: item.name || match.product.productName,
    supplierProductId: match.product.id,
    regularPrice: baseline,
    regularPriceSamples: baseline != null ? 1 : 0,
    priceFlagKey,
    priceCompareStatus,
    priceDeltaAmount: deltaAmount,
    priceDeltaPercent: deltaPercent,
    productMatchScore: match.score,
  };
}

/**
 * READ-ONLY: מזהה ספק, משווה פריטים ומחירים מול מחירון הספק.
 * עדכון DB — רק בשמירת המסמך (recordSupplierPriceHistoryFromExpense).
 */
export async function enrichExpenseSupplierScan<T extends ScannedDocument>(
  doc: T,
): Promise<T & { priceCompareSummary?: PriceCompareSummary }> {
  const scannedSupplierName = (doc.supplierRawName || doc.supplierName || "").trim();
  let supplierId = doc.supplierId ?? null;
  let supplierName = doc.supplierName;
  let suggestNewSupplier = doc.suggestNewSupplier ?? false;
  let suggestedSupplierId = doc.suggestedSupplierId ?? null;
  let suggestedSupplierName = doc.suggestedSupplierName ?? null;
  let supplierMatchScore = doc.supplierMatchScore ?? null;

  if (scannedSupplierName) {
    const suggestions = await rankSupplierSuggestions(scannedSupplierName, 5);
    const top = suggestions[0];
    if (top && top.score >= SUPPLIER_AUTO_MATCH_SCORE) {
      supplierId = top.id;
      supplierName = top.name;
      supplierMatchScore = top.score;
      suggestNewSupplier = false;
    } else if (top && top.score >= 0.55) {
      suggestedSupplierId = top.id;
      suggestedSupplierName = top.name;
      supplierMatchScore = top.score;
      suggestNewSupplier = true;
    } else {
      suggestNewSupplier = true;
    }
  }

  let items = doc.items;
  let priceCompareSummary: PriceCompareSummary | undefined;

  if (supplierId && doc.items.length > 0) {
    const catalog = await loadSupplierCatalog(supplierId);
    items = doc.items.map((item) => enrichItem(item, catalog));
    priceCompareSummary = summarizePriceCompare(
      items.map((i) => i.priceCompareStatus ?? "new"),
    );
  }

  return {
    ...doc,
    supplierId,
    supplierName: supplierId ? supplierName : doc.supplierName,
    suggestNewSupplier,
    suggestedSupplierId,
    suggestedSupplierName,
    supplierMatchScore,
    items,
    priceCompareSummary,
  };
}
