"use client";

import { useEffect, useState } from "react";
import { History, Loader2, X } from "lucide-react";

type HistoryRow = {
  id: string;
  countDate: string;
  currentQuantity: number;
  previousQuantity: number;
  difference: number;
  countedBy: { fullName: string } | null;
  product: { name: string };
};

type Props = {
  open: boolean;
  shelfName: string;
  onClose: () => void;
  t: (key: string) => string;
  locale: string;
};

export function ShelfHistoryModal({ open, shelfName, onClose, t, locale }: Props) {
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !shelfName) return;
    setLoading(true);
    void (async () => {
      try {
        const params = new URLSearchParams({ location: shelfName, pageSize: "50" });
        const res = await fetch(`/api/inventory/count-history?${params}`, {
          credentials: "same-origin",
          cache: "no-store",
        });
        const j = (await res.json()) as { data?: HistoryRow[] };
        setRows(j.data ?? []);
      } catch {
        setRows([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [open, shelfName]);

  if (!open) return null;

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString(locale, {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-[20px] border border-[#e7ecf5] bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-2">
            <History className="h-5 w-5 text-[#6c4cff]" />
            <div>
              <h3 className="text-lg font-black text-slate-900">{t("title")}</h3>
              <p className="text-xs font-semibold text-slate-500">{shelfName}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-xl hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-[#6c4cff]" />
            </div>
          ) : rows.length === 0 ? (
            <p className="py-8 text-center text-sm font-semibold text-slate-500">{t("empty")}</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {rows.map((r) => (
                <li key={r.id} className="flex items-start justify-between gap-3 py-2.5 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-black text-slate-900">{r.product.name}</p>
                    <p className="text-[11px] font-semibold text-slate-500">
                      {fmt(r.countDate)}
                      {r.countedBy?.fullName ? ` · ${r.countedBy.fullName}` : ""}
                    </p>
                  </div>
                  <div className="shrink-0 text-end text-xs font-bold">
                    <p className="text-slate-700">
                      {r.previousQuantity} → {r.currentQuantity}
                    </p>
                    <p className={r.difference < 0 ? "text-rose-600" : r.difference > 0 ? "text-amber-600" : "text-emerald-600"}>
                      {r.difference > 0 ? "+" : ""}
                      {r.difference}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
