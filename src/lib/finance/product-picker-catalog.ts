import { Prisma } from "@prisma/client";
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

export type ProductPickerSearchResult = {
  rows: ProductPickerRow[];
  hasMore: boolean;
};

function norm(name: string): string {
  return name.trim().toLowerCase();
}

function rowFromSupplierProduct(sp: {
  id: string;
  productName: string;
  regularPrice: number;
  unit: string | null;
  supplierId: string;
  supplier: { name: string };
  priceHistory: { price: number }[];
}): ProductPickerRow {
  const lastPrice = sp.priceHistory[0]?.price ?? sp.regularPrice;
  return {
    key: `sp:${sp.id}`,
    name: sp.productName,
    lastPrice: lastPrice > 0 ? lastPrice : sp.regularPrice,
    unit: sp.unit,
    supplierId: sp.supplierId,
    supplierName: sp.supplier.name,
    supplierProductId: sp.id,
    productId: null,
    vatMode: "includes_vat",
  };
}

function rowFromProduct(p: {
  id: string;
  name: string;
  supplierId: string | null;
  supplier: { name: string } | null;
}): ProductPickerRow {
  return {
    key: `p:${p.id}`,
    name: p.name,
    lastPrice: 0,
    unit: null,
    supplierId: p.supplierId,
    supplierName: p.supplier?.name ?? null,
    supplierProductId: null,
    productId: p.id,
    vatMode: "includes_vat",
  };
}

const spSelect = {
  id: true,
  productName: true,
  regularPrice: true,
  unit: true,
  supplierId: true,
  supplier: { select: { name: true } },
  priceHistory: { orderBy: { recordedAt: "desc" as const }, take: 1, select: { price: true } },
} as const;

const productSelect = {
  id: true,
  name: true,
  supplierId: true,
  supplier: { select: { name: true } },
} as const;

/** חיפוש ממוקד — select בלבד, עד 20 שורות לעמוד */
export async function searchProductPickerCatalog(params: {
  q?: string;
  supplierId?: string | null;
  skip?: number;
  take?: number;
}): Promise<ProductPickerSearchResult> {
  const take = Math.min(30, Math.max(5, params.take ?? 20));
  const skip = Math.max(0, params.skip ?? 0);
  const q = params.q?.trim() ?? "";
  const supplierId = params.supplierId?.trim() || null;
  const nameFilter = q ? ({ contains: q, mode: "insensitive" as const } as const) : undefined;
  const fetchN = skip + take + 1;

  if (supplierId) {
    const rows = await prisma.supplierProduct.findMany({
      where: {
        supplierId,
        ...(nameFilter ? { productName: nameFilter } : {}),
      },
      orderBy: { productName: "asc" },
      skip,
      take: take + 1,
      select: spSelect,
    });
    const hasMore = rows.length > take;
    return {
      rows: rows.slice(0, take).map(rowFromSupplierProduct),
      hasMore,
    };
  }

  const namePredSp = nameFilter
    ? Prisma.sql`WHERE sp."productName" ILIKE ${`%${q}%`}`
    : Prisma.empty;
  const namePredP = nameFilter ? Prisma.sql`WHERE p.name ILIKE ${`%${q}%`}` : Prisma.empty;
  const raw = await prisma.$queryRaw<
    Array<{
      src: "sp" | "p";
      id: string;
      name: string;
      last_price: number | null;
      unit: string | null;
      supplier_id: string | null;
      supplier_name: string | null;
      supplier_product_id: string | null;
      product_id: string | null;
    }>
  >`
    (
      SELECT
        'sp'::text AS src,
        sp.id,
        sp."productName" AS name,
        COALESCE(NULLIF(ph.price, 0), sp."regularPrice") AS last_price,
        sp.unit,
        sp."supplierId" AS supplier_id,
        s.name AS supplier_name,
        sp.id AS supplier_product_id,
        NULL::text AS product_id
      FROM "SupplierProduct" sp
      INNER JOIN "Supplier" s ON s.id = sp."supplierId"
      LEFT JOIN LATERAL (
        SELECT h.price
        FROM "SupplierProductPriceHistory" h
        WHERE h."supplierProductId" = sp.id
        ORDER BY h."recordedAt" DESC
        LIMIT 1
      ) ph ON true
      ${namePredSp}
      ORDER BY sp."productName" ASC
      LIMIT ${fetchN}
    )
    UNION ALL
    (
      SELECT
        'p'::text AS src,
        p.id,
        p.name,
        0::double precision AS last_price,
        NULL::text AS unit,
        p."supplierId" AS supplier_id,
        s.name AS supplier_name,
        NULL::text AS supplier_product_id,
        p.id AS product_id
      FROM "Product" p
      LEFT JOIN "Supplier" s ON s.id = p."supplierId"
      ${namePredP}
      ORDER BY p.name ASC
      LIMIT ${fetchN}
    )
  `;

  const byNorm = new Map<string, ProductPickerRow>();
  const merged: ProductPickerRow[] = [];

  const push = (row: ProductPickerRow) => {
    const k = norm(row.name);
    if (byNorm.has(k)) return;
    byNorm.set(k, row);
    merged.push(row);
  };

  for (const row of raw) {
    if (row.src === "sp") {
      const price = Number(row.last_price ?? 0);
      push({
        key: `sp:${row.id}`,
        name: row.name,
        lastPrice: price,
        unit: row.unit,
        supplierId: row.supplier_id,
        supplierName: row.supplier_name,
        supplierProductId: row.supplier_product_id,
        productId: null,
        vatMode: "includes_vat",
      });
    } else {
      push(rowFromProduct({
        id: row.id,
        name: row.name,
        supplierId: row.supplier_id,
        supplier: row.supplier_name ? { name: row.supplier_name } : null,
      }));
    }
  }

  merged.sort((a, b) => a.name.localeCompare(b.name, "he"));
  const page = merged.slice(skip, skip + take + 1);
  const hasMore = page.length > take;

  return {
    rows: page.slice(0, take),
    hasMore,
  };
}

/** @deprecated — השתמשו ב-searchProductPickerCatalog; נשמר לתאימות */
export async function loadProductPickerCatalog(
  supplierId?: string | null,
): Promise<ProductPickerRow[]> {
  const { rows } = await searchProductPickerCatalog({
    supplierId,
    skip: 0,
    take: 20,
  });
  return rows;
}
