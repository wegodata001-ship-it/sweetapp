"use client";

import { useState } from "react";
import { X } from "lucide-react";

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: (shelf: { id: string; name: string; description: string | null }) => void;
  t: (key: string) => string;
};

export function AddShelfModal({ open, onClose, onCreated, t }: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError(t("nameRequired"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/inventory/locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          name: trimmed,
          description: description.trim() || null,
        }),
      });
      const j = (await res.json()) as {
        ok?: boolean;
        error?: string;
        data?: { id: string; name: string; description: string | null };
      };
      if (!res.ok || !j.ok || !j.data) {
        setError(j.error ?? t("saveFailed"));
        return;
      }
      onCreated(j.data);
      setName("");
      setDescription("");
      onClose();
    } catch {
      setError(t("saveFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
      <div
        className="w-full max-w-md rounded-[20px] border border-[#e7ecf5] bg-white p-5 shadow-2xl"
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-black text-slate-900">{t("title")}</h3>
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-xl text-slate-500 hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-4 space-y-3 text-end">
          <label className="block">
            <span className="text-xs font-bold text-slate-600">{t("name")}</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 h-11 w-full rounded-xl border border-[#e7ecf5] px-3 text-sm font-semibold outline-none focus:border-[#6c4cff] focus:ring-2 focus:ring-[#6c4cff]/20"
            />
          </label>
          <label className="block">
            <span className="text-xs font-bold text-slate-600">{t("description")}</span>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1 h-11 w-full rounded-xl border border-[#e7ecf5] px-3 text-sm font-semibold outline-none focus:border-[#6c4cff]"
            />
          </label>
          {error ? <p className="text-sm font-bold text-[#ff5b6e]">{error}</p> : null}
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void submit()}
          className="mt-5 w-full rounded-2xl py-3 text-sm font-black text-white disabled:opacity-60"
          style={{ background: "#6c4cff" }}
        >
          {busy ? "…" : t("save")}
        </button>
      </div>
    </div>
  );
}
