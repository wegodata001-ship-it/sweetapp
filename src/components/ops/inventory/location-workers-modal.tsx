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
    <div className="fixed inset-0 z-[95] flex items-end justify-center bg-slate-950/50 p-0 sm:items-center sm:p-4">
      <div
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-[24px] bg-white p-5 shadow-2xl sm:rounded-[24px]"
        dir="rtl"
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-black text-slate-900">{t("editWorkersTitle")}</h3>
          <button
            type="button"
            onClick={onClose}
            className="grid h-11 w-11 place-items-center rounded-xl hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mt-1 text-xs font-semibold text-slate-500">{t("editWorkersHint")}</p>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-7 w-7 animate-spin text-[#6c4cff]" />
          </div>
        ) : (
          <div className="mt-4">
            <LocationWorkersEditor workers={workers} onChange={setWorkers} t={t} />
          </div>
        )}

        {error ? <p className="mt-3 text-sm font-bold text-rose-600">{error}</p> : null}

        <div className="mt-5 grid grid-cols-2 gap-2">
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
