"use client";

import { useCallback, useRef, useState } from "react";
import type { ProductPickerRow } from "@/lib/finance/product-picker-catalog";

const cache = new Map<string, { data: ProductPickerRow[]; hasMore: boolean; at: number }>();
const TTL_MS = 5 * 60_000;
const DEBOUNCE_MS = 400;

function cacheKey(supplierId: string | null | undefined, q: string, skip: number): string {
  const s = supplierId?.trim() ? `s:${supplierId}` : "__all__";
  return `${s}|${q.trim().toLowerCase()}|${skip}`;
}

function buildUrl(supplierId: string | null | undefined, q: string, skip: number, take: number): string {
  const params = new URLSearchParams();
  if (supplierId?.trim()) params.set("supplierId", supplierId.trim());
  if (q.trim()) params.set("q", q.trim());
  if (skip > 0) params.set("skip", String(skip));
  params.set("take", String(take));
  const qs = params.toString();
  return `/api/finance/product-picker${qs ? `?${qs}` : ""}`;
}

/** חיפוש ממוקד עם debounce — לא טוען מאגר מלא בהתחלה */
export function useProductPickerSearch(supplierId?: string | null) {
  const [rows, setRows] = useState<ProductPickerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reqIdRef = useRef(0);

  const fetchPage = useCallback(
    async (q: string, skip: number, append: boolean) => {
      const key = cacheKey(supplierId, q, skip);
      const hit = cache.get(key);
      if (hit && Date.now() - hit.at < TTL_MS) {
        setRows((prev) => (append ? [...prev, ...hit.data] : hit.data));
        setHasMore(hit.hasMore);
        setLoading(false);
        return;
      }

      const myId = ++reqIdRef.current;
      setLoading(true);
      try {
        const res = await fetch(buildUrl(supplierId, q, skip, 20), { credentials: "same-origin" });
        const j = (await res.json()) as {
          ok?: boolean;
          data?: ProductPickerRow[];
          hasMore?: boolean;
        };
        if (myId !== reqIdRef.current) return;
        const data = j.ok && Array.isArray(j.data) ? j.data : [];
        const more = Boolean(j.hasMore);
        cache.set(key, { data, hasMore: more, at: Date.now() });
        setRows((prev) => (append ? [...prev, ...data] : data));
        setHasMore(more);
      } catch {
        if (myId !== reqIdRef.current) return;
        if (!append) setRows([]);
        setHasMore(false);
      } finally {
        if (myId === reqIdRef.current) setLoading(false);
      }
    },
    [supplierId],
  );

  const search = useCallback(
    (q: string, immediate = false) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      const run = () => void fetchPage(q, 0, false);
      if (immediate) {
        run();
        return;
      }
      debounceRef.current = setTimeout(run, DEBOUNCE_MS);
    },
    [fetchPage],
  );

  const loadMore = useCallback(
    (q: string) => {
      if (!hasMore || loading) return;
      void fetchPage(q, rows.length, true);
    },
    [fetchPage, hasMore, loading, rows.length],
  );

  const appendToCache = useCallback(
    (row: ProductPickerRow) => {
      setRows((prev) => {
        const next = [...prev.filter((p) => p.key !== row.key), row].sort((a, b) =>
          a.name.localeCompare(b.name, "he"),
        );
        return next;
      });
    },
    [],
  );

  return { rows, loading, hasMore, search, loadMore, appendToCache };
}

/** @deprecated — השתמשו ב-useProductPickerSearch; לא טוען עד search() */
export function useProductPickerCatalog(supplierId?: string | null) {
  const { rows, loading, appendToCache, search } = useProductPickerSearch(supplierId);
  const reload = useCallback(async () => search("", true), [search]);
  return { catalog: rows, loading, reload, appendToCache };
}
