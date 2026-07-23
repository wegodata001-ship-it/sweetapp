"use client";

import { useState } from "react";
import { X } from "lucide-react";

type Props = {
  open: boolean;
  shelfName: string;
  locationId: string;
  onClose: () => void;
  onCreated: (product: {
    id: string;
    name: string;
    location: string;
    unit: string | null;
    previousQuantity: number;
    minimumQuantity: number;
    lastCountedAt: string | null;
  }) => void;
  t: (key: string) => string;
};

export function AddShelfProductModal({
  open,
  shelfName,
  locationId,
  onClose,
  onCreated,
  t,
}: Props) {
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");
  const [minimumQuantity, setMinimumQuantity] = useState("0");
  const [worker1Name, setWorker1Name] = useState("");
  const [worker1Location, setWorker1Location] = useState("");
  const [worker2Name, setWorker2Name] = useState("");
  const [worker2Location, setWorker2Location] = useState("");
  const [worker3Name, setWorker3Name] = useState("");
  const [worker3Location, setWorker3Location] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const reset = () => {
    setName("");
    setUnit("");
    setMinimumQuantity("0");
    setWorker1Name("");
    setWorker1Location("");
    setWorker2Name("");
    setWorker2Location("");
    setWorker3Name("");
    setWorker3Location("");
  };

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError(t("nameRequired"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/inventory/count-products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          name: trimmed,
          locationId,
          unit: unit.trim() || null,
          category: "כללי",
          minimumQuantity: Number(minimumQuantity) || 0,
          worker1Name: worker1Name.trim() || null,
          worker1Location: worker1Location.trim() || null,
          worker2Name: worker2Name.trim() || null,
          worker2Location: worker2Location.trim() || null,
          worker3Name: worker3Name.trim() || null,
          worker3Location: worker3Location.trim() || null,
        }),
      });
      const j = (await res.json()) as {
        ok?: boolean;
        error?: string;
        data?: { id: string; name: string; unit: string | null };
      };
      if (!res.ok || !j.ok || !j.data) {
        setError(j.error ?? t("saveFailed"));
        return;
      }
      onCreated({
        id: j.data.id,
        name: j.data.name,
        location: shelfName,
        unit: j.data.unit,
        previousQuantity: 0,
        minimumQuantity: Number(minimumQuantity) || 0,
        lastCountedAt: null,
      });
      reset();
      onClose();
    } catch {
      setError(t("saveFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[20px] border border-[#e7ecf5] bg-white p-5 shadow-2xl">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-black text-slate-900">{t("title")}</h3>
          <button type="button" onClick={onClose} className="rounded-xl p-2 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-4 space-y-3 text-end">
          <label className="block">
            <span className="text-xs font-bold text-slate-600">{t("name")}</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 h-11 w-full rounded-xl border border-[#e7ecf5] px-3 text-sm font-semibold"
            />
          </label>
          <label className="block">
            <span className="text-xs font-bold text-slate-600">{t("unit")}</span>
            <input
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              className="mt-1 h-11 w-full rounded-xl border border-[#e7ecf5] px-3 text-sm font-semibold"
            />
          </label>
          <label className="block">
            <span className="text-xs font-bold text-slate-600">{t("minimum")}</span>
            <input
              type="number"
              value={minimumQuantity}
              onChange={(e) => setMinimumQuantity(e.target.value)}
              className="mt-1 h-11 w-full rounded-xl border border-[#e7ecf5] px-3 text-sm font-semibold"
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-bold text-slate-600">{t("worker1")}</span>
              <input
                value={worker1Name}
                onChange={(e) => setWorker1Name(e.target.value)}
                className="mt-1 h-11 w-full rounded-xl border border-[#e7ecf5] px-3 text-sm font-semibold"
              />
            </label>
            <label className="block">
              <span className="text-xs font-bold text-slate-600">{t("worker1Loc")}</span>
              <input
                value={worker1Location}
                onChange={(e) => setWorker1Location(e.target.value)}
                className="mt-1 h-11 w-full rounded-xl border border-[#e7ecf5] px-3 text-sm font-semibold"
              />
            </label>
            <label className="block">
              <span className="text-xs font-bold text-slate-600">{t("worker2")}</span>
              <input
                value={worker2Name}
                onChange={(e) => setWorker2Name(e.target.value)}
                className="mt-1 h-11 w-full rounded-xl border border-[#e7ecf5] px-3 text-sm font-semibold"
              />
            </label>
            <label className="block">
              <span className="text-xs font-bold text-slate-600">{t("worker2Loc")}</span>
              <input
                value={worker2Location}
                onChange={(e) => setWorker2Location(e.target.value)}
                className="mt-1 h-11 w-full rounded-xl border border-[#e7ecf5] px-3 text-sm font-semibold"
              />
            </label>
            <label className="block">
              <span className="text-xs font-bold text-slate-600">{t("worker3")}</span>
              <input
                value={worker3Name}
                onChange={(e) => setWorker3Name(e.target.value)}
                className="mt-1 h-11 w-full rounded-xl border border-[#e7ecf5] px-3 text-sm font-semibold"
              />
            </label>
            <label className="block">
              <span className="text-xs font-bold text-slate-600">{t("worker3Loc")}</span>
              <input
                value={worker3Location}
                onChange={(e) => setWorker3Location(e.target.value)}
                className="mt-1 h-11 w-full rounded-xl border border-[#e7ecf5] px-3 text-sm font-semibold"
              />
            </label>
          </div>
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
