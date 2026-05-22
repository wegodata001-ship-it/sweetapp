"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useProductPickerCatalog } from "@/components/finance/use-product-picker-catalog";
import type { ProductPickerRow } from "@/lib/finance/product-picker-catalog";

type Ctx = {
  catalog: ProductPickerRow[];
  loading: boolean;
  appendToCache: (row: ProductPickerRow) => void;
  reload: () => Promise<void>;
};

const ProductPickerCatalogContext = createContext<Ctx | null>(null);

/** טעינת מאגר מוצרים פעם אחת לטופס מסמך */
export function ProductPickerCatalogProvider({
  supplierId,
  children,
}: {
  supplierId?: string | null;
  children: ReactNode;
}) {
  const state = useProductPickerCatalog(supplierId);
  return (
    <ProductPickerCatalogContext.Provider value={state}>{children}</ProductPickerCatalogContext.Provider>
  );
}

export function useProductPickerCatalogContext(): Ctx | null {
  return useContext(ProductPickerCatalogContext);
}
