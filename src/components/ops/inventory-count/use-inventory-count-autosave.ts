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

/**
 * Legacy autosave ל־count-line — כבוי.
 * שמירת ספירה חיה: ShelfCountModal → POST /api/inventory/monthly-count
 */
export function useInventoryCountAutosave({ onSaved: _onSaved, debounceMs = 450 }: Options) {
  const { showToast } = useToast();
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const warnedRef = useRef(false);

  const persistLine = useCallback(
    async (
      productId: string,
      _qty: number,
      setState: (id: string, state: CountSaveState) => void,
    ): Promise<SaveLineResult | null> => {
      setState(productId, "error");
      if (!warnedRef.current) {
        warnedRef.current = true;
        showToast({
          tone: "error",
          title: "שמירה אוטומטית הוצאה משימוש — שמרו דרך מסך הספירה",
          durationMs: 2800,
        });
      }
      return null;
    },
    [showToast],
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

  const seedSaved = useCallback((_productId: string, _qty: number) => {}, []);

  return { scheduleSave, persistLine, flushAll, seedSaved };
}
