"use client";

import { useCallback, useRef } from "react";
import { useToast } from "@/components/toast-provider";

export type CountSaveState = "idle" | "pending" | "saving" | "saved" | "error";

type SaveLineResult = {
  inventoryProductId: string;
  previousQuantity: number;
  currentQuantity: number;
  difference: number;
  skipped?: boolean;
};

type Options = {
  countDate: string;
  onSaved?: (result: SaveLineResult) => void;
  debounceMs?: number;
};

export function useInventoryCountAutosave({ countDate, onSaved, debounceMs = 450 }: Options) {
  const { showToast } = useToast();
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const inflightRef = useRef<Set<string>>(new Set());
  const lastSavedRef = useRef<Record<string, number>>({});
  const lastToastAtRef = useRef(0);

  const persistLine = useCallback(
    async (
      productId: string,
      qty: number,
      setState: (id: string, state: CountSaveState) => void,
    ): Promise<SaveLineResult | null> => {
      if (inflightRef.current.has(productId)) return null;
      if (lastSavedRef.current[productId] === qty) {
        setState(productId, "saved");
        return null;
      }

      inflightRef.current.add(productId);
      setState(productId, "saving");
      try {
        const res = await fetch("/api/inventory/count-line", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            inventoryProductId: productId,
            currentQuantity: qty,
            countDate,
          }),
        });
        const j = (await res.json()) as {
          ok?: boolean;
          error?: string;
          data?: SaveLineResult & { skipped?: boolean };
        };
        if (!res.ok || !j.ok || !j.data) {
          setState(productId, "error");
          showToast({ tone: "error", title: j.error ?? "שגיאת שמירה", durationMs: 2200 });
          return null;
        }
        lastSavedRef.current[productId] = qty;
        setState(productId, "saved");
        if (!j.data.skipped) {
          onSaved?.(j.data);
          const now = Date.now();
          if (now - lastToastAtRef.current > 1800) {
            lastToastAtRef.current = now;
            showToast({ tone: "success", title: "נשמר", durationMs: 1100 });
          }
        }
        return j.data;
      } catch {
        setState(productId, "error");
        showToast({ tone: "error", title: "שגיאת רשת", durationMs: 2200 });
        return null;
      } finally {
        inflightRef.current.delete(productId);
      }
    },
    [countDate, onSaved, showToast],
  );

  const scheduleSave = useCallback(
    (
      productId: string,
      qty: number,
      setState: (id: string, state: CountSaveState) => void,
    ) => {
      const prev = timersRef.current[productId];
      if (prev) clearTimeout(prev);
      setState(productId, "pending");
      timersRef.current[productId] = setTimeout(() => {
        delete timersRef.current[productId];
        void persistLine(productId, qty, setState);
      }, debounceMs);
    },
    [debounceMs, persistLine],
  );

  const flushAll = useCallback(
    async (
      lines: { id: string; qty: number }[],
      setState: (id: string, state: CountSaveState) => void,
    ) => {
      for (const id of Object.keys(timersRef.current)) {
        clearTimeout(timersRef.current[id]);
        delete timersRef.current[id];
      }
      await Promise.all(lines.map((l) => persistLine(l.id, l.qty, setState)));
    },
    [persistLine],
  );

  const seedSaved = useCallback((productId: string, qty: number) => {
    lastSavedRef.current[productId] = qty;
  }, []);

  return { scheduleSave, persistLine, flushAll, seedSaved };
}
