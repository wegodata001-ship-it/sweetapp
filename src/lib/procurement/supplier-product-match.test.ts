/**
 * בדיקות התאמת מוצר ספק והשוואת מחיר — npm run test:supplier-price-compare
 */
import {
  compareUnitPrice,
  extractBarcode,
  matchSupplierProduct,
  summarizePriceCompare,
  type SupplierProductRow,
} from "./supplier-product-match";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const catalog: SupplierProductRow[] = [
  {
    id: "p1",
    productName: "חלב 3%",
    regularPrice: 18,
    notes: "ברקוד: 7290001234567",
    lastPrice: 18,
  },
  {
    id: "p2",
    productName: "7290009999999",
    regularPrice: 12,
    notes: null,
    lastPrice: 12,
  },
];

async function runTests(): Promise<void> {
  console.log("supplier price compare tests…");

  assert(extractBarcode("7290001234567") === "7290001234567", "barcode from plain digits");
  assert(extractBarcode("מוצר 7290001234567") === "7290001234567", "barcode embedded in name");

  const byName = matchSupplierProduct("חלב 3%", catalog);
  assert(byName?.product.id === "p1", "exact name match");

  const byBarcode = matchSupplierProduct("7290001234567", catalog);
  assert(byBarcode?.product.id === "p1", "barcode via notes");

  const byBarcodeName = matchSupplierProduct("7290009999999", catalog);
  assert(byBarcodeName?.product.id === "p2", "barcode as product name");

  const none = matchSupplierProduct("מוצר לא קיים", catalog);
  assert(none === null, "no match for unknown");

  const unchanged = compareUnitPrice(18, 18);
  assert(unchanged.status === "unchanged", "unchanged price");

  const up = compareUnitPrice(21, 18);
  assert(up.status === "increased" && up.deltaAmount === 3, "price increase");

  const down = compareUnitPrice(15, 18);
  assert(down.status === "decreased", "price decrease");

  const summary = summarizePriceCompare(["new", "unchanged", "increased", "decreased"]);
  assert(summary.newItems === 1 && summary.unchanged === 1, "summary counts");
  assert(summary.increased === 1 && summary.decreased === 1, "summary change counts");

  console.log("All supplier price compare tests passed.");
}

runTests().catch((e) => {
  console.error("supplier price compare tests FAILED:", e);
  process.exit(1);
});
