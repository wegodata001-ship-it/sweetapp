"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useProductPickerSearch } from "@/components/finance/use-product-picker-catalog";
import type { ProductPickerRow } from "@/lib/finance/product-picker-catalog";

type Ctx = {
  appendToCache: (row: ProductPickerRow) => void;
};

const ProductPickerCatalogContext = createContext<Ctx | null>(null);

/** מספק appendToCache משותף לטופס — ללא טעינת מאגר מלא */
export function ProductPickerCatalogProvider({
  children,
}: {
  supplierId?: string | null;
  children: ReactNode;
}) {
  const { appendToCache } = useProductPickerSearch();
  return (
    <ProductPickerCatalogContext.Provider value={{ appendToCache }}>
      {children}
    </ProductPickerCatalogContext.Provider>
  );
}

export function useProductPickerCatalogContext(): Ctx | null {
  return useContext(ProductPickerCatalogContext);
}
