"use client";

import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import {
  draftsToPayload,
  LocationWorkersEditor,
  toWorkerDrafts,
  type WorkerDraft,
} from "./location-workers-editor";
import type { LocationWorkerRow } from "@/lib/inventory/location-workers";

type Props = {
  open: boolean;
  locationId: string | null;
  onClose: () => void;
  onSaved: (workers: LocationWorkerRow[]) => void;
  t: (key: string) => string;
};

export function LocationWorkersModal({ open, locationId, onClose, onSaved, t }: Props) {
  const [workers, setWorkers] = useState<WorkerDraft[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !locationId) return;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const res = await fetch(`/api/inventory/locations/${encodeURIComponent(locationId)}/workers`, {
          credentials: "same-origin",
        });
        const j = (await res.json()) as { data?: LocationWorkerRow[] };
        setWorkers(toWorkerDrafts(j.data ?? []));
      } catch {
        setWorkers([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [open, locationId]);

  if (!open) return null;

  const save = async () => {
    if (!locationId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/inventory/locations/${encodeURIComponent(locationId)}/workers`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ workers: draftsToPayload(workers) }),
      });
      const j = (await res.json()) as {
        ok?: boolean;
        error?: string;
        data?: LocationWorkerRow[];
      };
      if (!res.ok || !j.ok) {
        setError(j.error ?? t("saveFailed"));
        return;
      }
      onSaved(j.data ?? []);
      onClose();
    } catch {
      setError(t("saveFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[210] flex items-stretch justify-center bg-slate-950/50 p-0 sm:items-center sm:p-4">
      {/* מסך מלא במובייל — הכותרת והשמירה קבועות מעל המקלדת */}
      <div
        className="flex h-[100dvh] w-full flex-col overflow-hidden rounded-none bg-white shadow-2xl sm:h-auto sm:max-h-[92vh] sm:max-w-lg sm:rounded-[24px]"
        dir="rtl"
        role="dialog"
        aria-modal="true"
      >
        <div className="shrink-0 border-b border-[#e7ecf5] px-4 py-3 sm:px-5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-black text-slate-900">{t("editWorkersTitle")}</h3>
            <button
              type="button"
              onClick={onClose}
              aria-label={t("cancel")}
              className="grid h-11 w-11 place-items-center rounded-xl hover:bg-slate-100"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <p className="mt-1 text-xs font-semibold text-slate-500">{t("editWorkersHint")}</p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-7 w-7 animate-spin text-[#6c4cff]" />
            </div>
          ) : (
            <LocationWorkersEditor workers={workers} onChange={setWorkers} t={t} />
          )}

          {error ? <p className="mt-3 text-sm font-bold text-rose-600">{error}</p> : null}
        </div>

        <div className="grid shrink-0 grid-cols-2 gap-2 border-t border-[#e7ecf5] px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5">
          <button
            type="button"
            onClick={onClose}
            className="min-h-12 rounded-2xl border border-slate-200 text-sm font-black text-slate-600"
          >
            {t("cancel")}
          </button>
          <button
            type="button"
            disabled={busy || loading || !locationId}
            onClick={() => void save()}
            className="min-h-12 rounded-2xl bg-[#6c4cff] text-sm font-black text-white disabled:opacity-50"
          >
            {busy ? "…" : t("save")}
          </button>
        </div>
      </div>
    </div>
  );
}
