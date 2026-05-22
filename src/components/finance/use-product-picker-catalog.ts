"use client";

import { useCallback, useEffect, useState } from "react";
import type { ProductPickerRow } from "@/lib/finance/product-picker-catalog";

const cache = new Map<string, { data: ProductPickerRow[]; at: number }>();
const TTL_MS = 5 * 60_000;

function cacheKey(supplierId: string | null | undefined): string {
  return supplierId?.trim() ? `s:${supplierId}` : "__all__";
}

export function useProductPickerCatalog(supplierId?: string | null) {
  const [catalog, setCatalog] = useState<ProductPickerRow[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const key = cacheKey(supplierId);
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < TTL_MS) {
      setCatalog(hit.data);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const params = supplierId ? `?supplierId=${encodeURIComponent(supplierId)}` : "";
      const res = await fetch(`/api/finance/product-picker${params}`, {
        credentials: "same-origin",
      });
      const j = (await res.json()) as { ok?: boolean; data?: ProductPickerRow[] };
      const data = j.ok && Array.isArray(j.data) ? j.data : [];
      cache.set(key, { data, at: Date.now() });
      setCatalog(data);
    } catch {
      setCatalog([]);
    } finally {
      setLoading(false);
    }
  }, [supplierId]);

  useEffect(() => {
    queueMicrotask(() => void reload());
  }, [reload]);

  const appendToCache = useCallback(
    (row: ProductPickerRow) => {
      const key = cacheKey(supplierId);
      setCatalog((prev) => {
        const next = [...prev.filter((p) => p.key !== row.key), row].sort((a, b) =>
          a.name.localeCompare(b.name, "he"),
        );
        cache.set(key, { data: next, at: Date.now() });
        return next;
      });
    },
    [supplierId],
  );

  return { catalog, loading, reload, appendToCache };
}
