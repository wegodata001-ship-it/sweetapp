"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import {
  LOCATION_COLORS,
  LOCATION_TYPES,
  type LocationType,
} from "@/lib/inventory/location-types";
import {
  draftsToPayload,
  LocationWorkersEditor,
  toWorkerDrafts,
  type WorkerDraft,
} from "./location-workers-editor";
import type { LocationWorkerRow } from "@/lib/inventory/location-workers";

export type LocationFormValues = {
  id?: string;
  name: string;
  code: string | null;
  description: string | null;
  locationType: LocationType;
  targetProductCount: number | null;
  color: string | null;
  isActive: boolean;
  workers?: LocationWorkerRow[];
};

type Props = {
  open: boolean;
  mode: "create" | "edit";
  initial?: Partial<LocationFormValues> | null;
  onClose: () => void;
  onSaved: (loc: LocationFormValues & { id: string }) => void;
  t: (key: string) => string;
  tType: (type: LocationType) => string;
};

const empty: LocationFormValues = {
  name: "",
  code: null,
  description: null,
  locationType: "WAREHOUSE",
  targetProductCount: null,
  color: null,
  isActive: true,
};

export function LocationFormModal({
  open,
  mode,
  initial,
  onClose,
  onSaved,
  t,
  tType,
}: Props) {
  const [form, setForm] = useState<LocationFormValues>(empty);
  const [workers, setWorkers] = useState<WorkerDraft[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setForm({
      ...empty,
      ...initial,
      name: initial?.name ?? "",
      code: initial?.code ?? null,
      description: initial?.description ?? null,
      locationType: (initial?.locationType as LocationType) || "WAREHOUSE",
      targetProductCount: initial?.targetProductCount ?? null,
      color: initial?.color ?? null,
      isActive: initial?.isActive ?? true,
      id: initial?.id,
    });
    setWorkers(toWorkerDrafts(initial?.workers ?? []));
  }, [open, initial]);

  if (!open) return null;

  const submit = async () => {
    const trimmed = form.name.trim();
    if (!trimmed) {
      setError(t("nameRequired"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const payload = {
        name: trimmed,
        code: form.code?.trim() || null,
        description: form.description?.trim() || null,
        locationType: form.locationType,
        targetProductCount: form.targetProductCount,
        color: form.color,
        isActive: form.isActive,
        workers: draftsToPayload(workers),
      };
      const url =
        mode === "edit" && form.id
          ? `/api/inventory/locations/${encodeURIComponent(form.id)}`
          : "/api/inventory/locations";
      const res = await fetch(url, {
        method: mode === "edit" ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(payload),
      });
      const j = (await res.json()) as {
        ok?: boolean;
        error?: string;
        data?: LocationFormValues & { id: string };
      };
      if (!res.ok || !j.ok || !j.data) {
        setError(j.error ?? t("saveFailed"));
        return;
      }
      onSaved({
        id: j.data.id,
        name: j.data.name,
        code: j.data.code ?? null,
        description: j.data.description ?? null,
        locationType: (j.data.locationType as LocationType) || "WAREHOUSE",
        targetProductCount: j.data.targetProductCount ?? null,
        color: j.data.color ?? null,
        isActive: j.data.isActive ?? true,
        workers: (j.data as LocationFormValues).workers ?? draftsToPayload(workers).map((w, i) => ({
          id: `w-${i}`,
          name: w.name,
          area: w.area ?? "",
          sortOrder: i,
        })),
      });
      onClose();
    } catch {
      setError(t("saveFailed"));
    } finally {
      setBusy(false);
    }
  };

  const inputClass =
    "mt-1 h-11 w-full rounded-xl border border-[#e7ecf5] px-3 text-sm font-semibold outline-none focus:border-[#6c4cff] focus:ring-2 focus:ring-[#6c4cff]/20";

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
      <div
        className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-[20px] border border-[#e7ecf5] bg-white p-5 shadow-2xl"
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-black text-slate-900">
            {mode === "edit" ? t("editTitle") : t("title")}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-xl text-slate-500 hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mt-1 text-xs font-semibold text-slate-500">{t("sectionDetails")}</p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="text-xs font-bold text-slate-600">{t("name")}</span>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="text-xs font-bold text-slate-600">{t("code")}</span>
            <input
              value={form.code ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value || null }))}
              className={inputClass}
              placeholder={t("codeOptional")}
            />
          </label>
          <label className="block">
            <span className="text-xs font-bold text-slate-600">{t("locationType")}</span>
            <select
              value={form.locationType}
              onChange={(e) =>
                setForm((f) => ({ ...f, locationType: e.target.value as LocationType }))
              }
              className={inputClass}
            >
              {LOCATION_TYPES.map((lt) => (
                <option key={lt} value={lt}>
                  {tType(lt)}
                </option>
              ))}
            </select>
          </label>
          <label className="block sm:col-span-2">
            <span className="text-xs font-bold text-slate-600">{t("description")}</span>
            <input
              value={form.description ?? ""}
              onChange={(e) =>
                setForm((f) => ({ ...f, description: e.target.value || null }))
              }
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="text-xs font-bold text-slate-600">{t("targetCount")}</span>
            <input
              type="number"
              min={0}
              value={form.targetProductCount ?? ""}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  targetProductCount: e.target.value === "" ? null : Number(e.target.value),
                }))
              }
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="text-xs font-bold text-slate-600">{t("status")}</span>
            <select
              value={form.isActive ? "active" : "inactive"}
              onChange={(e) =>
                setForm((f) => ({ ...f, isActive: e.target.value === "active" }))
              }
              className={inputClass}
            >
              <option value="active">{t("statusActive")}</option>
              <option value="inactive">{t("statusInactive")}</option>
            </select>
          </label>
          <div className="sm:col-span-2">
            <span className="text-xs font-bold text-slate-600">{t("color")}</span>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, color: null }))}
                className={`h-8 rounded-lg border px-2 text-[10px] font-black ${
                  !form.color ? "border-[#6c4cff] bg-violet-50 text-[#6c4cff]" : "border-slate-200"
                }`}
              >
                {t("colorDefault")}
              </button>
              {LOCATION_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, color: c }))}
                  className={`h-8 w-8 rounded-lg border-2 ${
                    form.color === c ? "border-[#6c4cff] ring-2 ring-[#6c4cff]/30" : "border-white"
                  }`}
                  style={{ background: c }}
                  aria-label={c}
                />
              ))}
            </div>
          </div>
          {error ? (
            <p className="sm:col-span-2 text-sm font-bold text-[#ff5b6e]">{error}</p>
          ) : null}
        </div>

        <div className="mt-5 border-t border-[#e7ecf5] pt-4">
          <LocationWorkersEditor workers={workers} onChange={setWorkers} t={t} />
        </div>

        <button
          type="button"
          disabled={busy}
          onClick={() => void submit()}
          className="mt-5 min-h-12 w-full rounded-2xl py-3 text-sm font-black text-white disabled:opacity-60"
          style={{ background: "#6c4cff" }}
        >
          {busy ? "…" : t("save")}
        </button>
      </div>
    </div>
  );
}
