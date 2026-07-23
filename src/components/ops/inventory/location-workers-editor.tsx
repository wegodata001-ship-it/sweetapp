"use client";

import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import type { LocationWorkerInput } from "@/lib/inventory/location-workers";

export type WorkerDraft = {
  key: string;
  name: string;
  area: string;
};

type Props = {
  workers: WorkerDraft[];
  onChange: (next: WorkerDraft[]) => void;
  t: (key: string) => string;
};

export function toWorkerDrafts(
  rows: { id?: string; name: string; area?: string | null }[],
): WorkerDraft[] {
  return rows.map((w, i) => ({
    key: w.id ?? `new-${i}-${w.name}`,
    name: w.name,
    area: w.area ?? "",
  }));
}

export function draftsToPayload(workers: WorkerDraft[]): LocationWorkerInput[] {
  return workers
    .map((w, i) => ({
      name: w.name.trim(),
      area: w.area.trim(),
      sortOrder: i,
    }))
    .filter((w) => w.name.length > 0);
}

export function LocationWorkersEditor({ workers, onChange, t }: Props) {
  const update = (key: string, patch: Partial<WorkerDraft>) => {
    onChange(workers.map((w) => (w.key === key ? { ...w, ...patch } : w)));
  };

  const move = (index: number, dir: -1 | 1) => {
    const next = [...workers];
    const j = index + dir;
    if (j < 0 || j >= next.length) return;
    const tmp = next[index];
    next[index] = next[j];
    next[j] = tmp;
    onChange(next);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-black text-slate-700">{t("workersTitle")}</p>
        <button
          type="button"
          onClick={() =>
            onChange([
              ...workers,
              { key: `new-${Date.now()}`, name: "", area: "" },
            ])
          }
          className="inline-flex min-h-10 items-center gap-1 rounded-xl border border-[#e7ecf5] bg-white px-3 text-xs font-black text-[#6c4cff]"
        >
          <Plus className="h-4 w-4" />
          {t("addWorker")}
        </button>
      </div>

      {workers.length === 0 ? (
        <p className="rounded-xl bg-slate-50 px-3 py-3 text-xs font-semibold text-slate-500">
          {t("workersEmpty")}
        </p>
      ) : (
        <div className="space-y-2">
          <div className="hidden grid-cols-[1fr_1fr_auto] gap-2 px-1 text-[10px] font-bold text-slate-500 sm:grid">
            <span>{t("workerName")}</span>
            <span>{t("workerArea")}</span>
            <span className="w-24 text-center">{t("workerOrder")}</span>
          </div>
          {workers.map((w, idx) => (
            <div
              key={w.key}
              className="grid gap-2 rounded-2xl border border-[#e7ecf5] bg-[#f8fafc] p-3 sm:grid-cols-[1fr_1fr_auto]"
            >
              <label className="block">
                <span className="mb-1 block text-[10px] font-bold text-slate-500 sm:hidden">
                  {t("workerName")}
                </span>
                <input
                  value={w.name}
                  onChange={(e) => update(w.key, { name: e.target.value })}
                  placeholder={t("workerName")}
                  className="h-11 w-full rounded-xl border border-[#e7ecf5] bg-white px-3 text-sm font-semibold"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[10px] font-bold text-slate-500 sm:hidden">
                  {t("workerArea")}
                </span>
                <input
                  value={w.area}
                  onChange={(e) => update(w.key, { area: e.target.value })}
                  placeholder={t("workerArea")}
                  className="h-11 w-full rounded-xl border border-[#e7ecf5] bg-white px-3 text-sm font-semibold"
                />
              </label>
              <div className="flex items-center justify-end gap-1">
                <button
                  type="button"
                  onClick={() => move(idx, -1)}
                  className="grid h-11 w-11 place-items-center rounded-xl border border-[#e7ecf5] bg-white"
                  aria-label="up"
                >
                  <ChevronUp className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => move(idx, 1)}
                  className="grid h-11 w-11 place-items-center rounded-xl border border-[#e7ecf5] bg-white"
                  aria-label="down"
                >
                  <ChevronDown className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onChange(workers.filter((x) => x.key !== w.key))}
                  className="grid h-11 w-11 place-items-center rounded-xl border border-rose-200 bg-rose-50 text-rose-600"
                  aria-label="delete"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
