import { prisma } from "@/lib/prisma";
import type { VatMode } from "@/lib/finance/document-payload";

export type ProductPickerRow = {
  key: string;
  name: string;
  lastPrice: number;
  unit: string | null;
  supplierId: string | null;
  supplierName: string | null;
  supplierProductId: string | null;
  productId: string | null;
  vatMode: VatMode;
};

function norm(name: string): string {
  return name.trim().toLowerCase();
}

/** טוען מאגר מוצרים לבחירה בשורות מסמך — פעם אחת ללקוח */
export async function loadProductPickerCatalog(
  supplierId?: string | null,
): Promise<ProductPickerRow[]> {
  const byNorm = new Map<string, ProductPickerRow>();
  const rows: ProductPickerRow[] = [];

  const push = (row: ProductPickerRow) => {
    const k = norm(row.name);
    const existing = byNorm.get(k);
    if (existing) {
      if (supplierId && row.supplierId === supplierId && existing.supplierId !== supplierId) {
        byNorm.set(k, row);
        const idx = rows.findIndex((r) => r.key === existing.key);
        if (idx >= 0) rows[idx] = row;
      }
      return;
    }
    byNorm.set(k, row);
    rows.push(row);
  };

  const supplierProducts = await prisma.supplierProduct.findMany({
    where: supplierId ? { supplierId } : undefined,
    orderBy: { productName: "asc" },
    take: 2000,
    include: {
      supplier: { select: { id: true, name: true } },
      priceHistory: { orderBy: { recordedAt: "desc" }, take: 1, select: { price: true } },
    },
  });

  for (const sp of supplierProducts) {
    const lastPrice = sp.priceHistory[0]?.price ?? sp.regularPrice;
    push({
      key: `sp:${sp.id}`,
      name: sp.productName,
      lastPrice: lastPrice > 0 ? lastPrice : sp.regularPrice,
      unit: sp.unit,
      supplierId: sp.supplierId,
      supplierName: sp.supplier.name,
      supplierProductId: sp.id,
      productId: null,
      vatMode: "includes_vat",
    });
  }

  const products = await prisma.product.findMany({
    where: supplierId ? { OR: [{ supplierId: null }, { supplierId }] } : undefined,
    orderBy: { name: "asc" },
    take: 1500,
    include: { supplier: { select: { id: true, name: true } } },
  });

  for (const p of products) {
    if (byNorm.has(norm(p.name))) continue;
    push({
      key: `p:${p.id}`,
      name: p.name,
      lastPrice: 0,
      unit: null,
      supplierId: p.supplierId,
      supplierName: p.supplier?.name ?? null,
      supplierProductId: null,
      productId: p.id,
      vatMode: "includes_vat",
    });
  }

  const recentItems = await prisma.financialDocumentItem.findMany({
    where: { itemName: { not: "" } },
    orderBy: { document: { createdAt: "desc" } },
    take: 400,
    select: {
      itemName: true,
      unitPrice: true,
      productId: true,
      vatType: true,
      document: { select: { title: true } },
    },
  });

  for (const item of recentItems) {
    const name = item.itemName.trim();
    if (!name || byNorm.has(norm(name))) continue;
    const vatMode: VatMode =
      item.vatType === "exempt" || item.vatType === "פטור ממע״מ"
        ? "exempt"
        : item.vatType === "before_vat" || item.vatType === "ללא מע״מ"
          ? "before_vat"
          : "includes_vat";
    push({
      key: `hist:${norm(name)}`,
      name,
      lastPrice: item.unitPrice > 0 ? item.unitPrice : 0,
      unit: null,
      supplierId: null,
      supplierName: null,
      supplierProductId: null,
      productId: item.productId,
      vatMode,
    });
  }

  return rows.sort((a, b) => a.name.localeCompare(b.name, "he"));
}
