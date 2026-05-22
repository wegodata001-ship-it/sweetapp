"use client";

import { Loader2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import type { CountHistoryRow } from "./types";
import { localYmd } from "./utils";

type Props = {
  open: boolean;
  shelfName: string;
  onClose: () => void;
};

export function ShelfHistoryDrawer({ open, shelfName, onClose }: Props) {
  const { t, bcp47, dir } = useI18n();
  const tD = (key: string, vars?: Record<string, string | number>) =>
    t(`ops.inventory.countDashboard.${key}`, vars);

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<CountHistoryRow[]>([]);

  useEffect(() => {
    if (!open || !shelfName.trim()) return;
    let cancelled = false;
    setLoading(true);
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 90);
    const params = new URLSearchParams({
      dateFrom: localYmd(start),
      dateTo: localYmd(end),
    });
    void (async () => {
      try {
        const res = await fetch(`/api/inventory/count-history?${params}`, {
          credentials: "same-origin",
        });
        const j = (await res.json()) as { data?: CountHistoryRow[] };
        if (cancelled) return;
        const shelf = shelfName.trim();
        setRows(
          (j.data ?? []).filter(
            (r) => (r.product?.location ?? "").trim() === shelf,
          ),
        );
      } catch {
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, shelfName]);

  if (!open) return null;

  const locale = bcp47 === "ar" ? "ar-IL" : bcp47 === "en" ? "en-GB" : "he-IL";
  const fmt = (iso: string) =>
    new Date(iso).toLocaleString(locale, {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <div
      dir={dir}
      className="fixed inset-0 z-[130] flex justify-end bg-black/40 backdrop-blur-[1px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <aside
        className="flex h-full w-full max-w-md flex-col bg-white shadow-2xl motion-safe:animate-[cashflowFilterIn_0.2s_ease-out] sm:rounded-s-2xl"
        role="dialog"
        aria-labelledby="shelf-history-title"
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-4">
          <div>
            <h3 id="shelf-history-title" className="text-base font-black text-slate-900">
              {tD("drawerHistoryTitle")}
            </h3>
            <p className="text-xs font-semibold text-slate-500">{shelfName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 hover:bg-slate-100"
            aria-label={tD("closeDrawer")}
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-7 w-7 animate-spin text-sky-600" />
            </div>
          ) : rows.length === 0 ? (
            <p className="py-8 text-center text-sm font-semibold text-slate-500">
              {tD("historyEmpty")}
            </p>
          ) : (
            <ul className="space-y-3">
              {rows.map((r) => (
                <li
                  key={r.id}
                  className="rounded-2xl border border-slate-100 bg-gradient-to-br from-slate-50/80 to-white p-3"
                >
                  <p className="font-bold text-slate-900">{r.product.name}</p>
                  <p className="mt-1 text-xs text-slate-500">{fmt(r.createdAt)}</p>
                  <p className="mt-2 text-sm font-semibold text-slate-700">
                    {r.previousQuantity} → {r.currentQuantity}{" "}
                    <span
                      className={
                        r.difference < 0
                          ? "text-rose-600"
                          : r.difference > 0
                            ? "text-amber-700"
                            : "text-emerald-700"
                      }
                    >
                      ({r.difference > 0 ? "+" : ""}
                      {r.difference})
                    </span>
                  </p>
                  <p className="mt-1 text-[11px] font-medium text-slate-500">
                    {r.countedBy?.fullName ?? "—"}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}

/** Drawer קטן לסטטיסטיקת מדף */
export function ShelfStatsDrawer({
  open,
  shelfName,
  productCount,
  shortageCount,
  countedToday,
  onClose,
}: {
  open: boolean;
  shelfName: string;
  productCount: number;
  shortageCount: number;
  countedToday: boolean;
  onClose: () => void;
}) {
  const { t, dir } = useI18n();
  const tD = (key: string, vars?: Record<string, string | number>) =>
    t(`ops.inventory.countDashboard.${key}`, vars);

  if (!open) return null;

  return (
    <div
      dir={dir}
      className="fixed inset-0 z-[130] flex justify-end bg-black/40"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <aside className="flex h-full w-full max-w-sm flex-col rounded-s-2xl bg-white shadow-2xl sm:my-4 sm:me-4 sm:h-auto sm:max-h-[80vh]">
        <div className="flex items-center justify-between border-b px-4 py-4">
          <h3 className="text-base font-black text-slate-900">{tD("drawerStatsTitle")}</h3>
          <button type="button" onClick={onClose} className="rounded-xl p-2 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-4 p-4">
          <p className="text-sm font-bold text-slate-600">{shelfName}</p>
          <div className="grid gap-3">
            <div className="rounded-2xl bg-sky-50 p-4 ring-1 ring-sky-100">
              <p className="text-xs font-bold text-sky-800">{tD("statProducts")}</p>
              <p className="mt-1 text-2xl font-black text-slate-900">{productCount}</p>
            </div>
            <div className="rounded-2xl bg-rose-50 p-4 ring-1 ring-rose-100">
              <p className="text-xs font-bold text-rose-800">{tD("kpiShortage")}</p>
              <p className="mt-1 text-2xl font-black text-rose-700">{shortageCount}</p>
            </div>
            <div className="rounded-2xl bg-emerald-50 p-4 ring-1 ring-emerald-100">
              <p className="text-xs font-bold text-emerald-800">{tD("statCountedToday")}</p>
              <p className="mt-1 text-lg font-black text-emerald-800">
                {countedToday ? tD("yes") : tD("no")}
              </p>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
