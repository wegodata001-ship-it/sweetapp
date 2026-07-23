"use client";

import { useEffect, useState } from "react";
import { ArrowRightLeft, Loader2, X } from "lucide-react";

type LocOption = { id: string; name: string };

type Props = {
  open: boolean;
  sourceName: string;
  sourceLocationId: string | null;
  locations: LocOption[];
  onClose: () => void;
  onTransferred: () => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
};

export function ShelfTransferModal({
  open,
  sourceName,
  sourceLocationId,
  locations,
  onClose,
  onTransferred,
  t,
}: Props) {
  const [targetId, setTargetId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setTargetId("");
  }, [open]);

  if (!open) return null;

  const options = locations.filter((l) => l.id !== sourceLocationId);

  const submit = async () => {
    if (!targetId) {
      setError(t("targetRequired"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const path = sourceLocationId ?? "by-name";
      const res = await fetch(`/api/inventory/shelves/${encodeURIComponent(path)}/transfer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          targetLocationId: targetId,
          shelfName: sourceName,
        }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string; data?: { moved?: number } };
      if (!res.ok || !j.ok) {
        setError(j.error ?? t("failed"));
        return;
      }
      onTransferred();
      onClose();
    } catch {
      setError(t("failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-[20px] border border-[#e7ecf5] bg-white p-5 shadow-2xl" role="dialog">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-violet-100 text-[#6c4cff]">
              <ArrowRightLeft className="h-5 w-5" />
            </span>
            <h3 className="text-lg font-black text-slate-900">{t("title")}</h3>
          </div>
          <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-xl hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mt-2 text-sm font-semibold text-slate-600">{t("from", { name: sourceName })}</p>
        <label className="mt-4 block">
          <span className="text-xs font-bold text-slate-600">{t("target")}</span>
          <select
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
            className="mt-1 h-11 w-full rounded-xl border border-[#e7ecf5] px-3 text-sm font-semibold"
          >
            <option value="">{t("targetPlaceholder")}</option>
            {options.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
        <p className="mt-2 text-[11px] font-medium text-slate-500">{t("hint")}</p>
        {error ? <p className="mt-2 text-sm font-bold text-rose-600">{error}</p> : null}
        <button
          type="button"
          disabled={busy}
          onClick={() => void submit()}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-sm font-black text-white disabled:opacity-60"
          style={{ background: "#6c4cff" }}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {t("confirm")}
        </button>
      </div>
    </div>
  );
}
