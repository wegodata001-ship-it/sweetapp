"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, Check, Loader2, X } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { useToast } from "@/components/toast-provider";
import {
  WEEKDAY_MINIMUM_FIELDS,
  type WeekdayMinimumField,
} from "@/lib/inventory/weekday-minimum";

type LocationOption = { id: string; name: string };

type WeekdayRow = {
  productId: string;
  name: string;
  unit: string | null;
  weekdays: Record<WeekdayMinimumField, number | null>;
};

type EditedRow = {
  productId: string;
  name: string;
  weekdays: Record<WeekdayMinimumField, string>;
};

type Props = {
  open: boolean;
  onClose: () => void;
  locations: LocationOption[];
};

const WEEKDAY_I18N_KEYS: WeekdayMinimumField[] = [...WEEKDAY_MINIMUM_FIELDS];

function emptyEdited(weekdays: Record<WeekdayMinimumField, number | null>): Record<WeekdayMinimumField, string> {
  const out = {} as Record<WeekdayMinimumField, string>;
  for (const f of WEEKDAY_MINIMUM_FIELDS) {
    out[f] = weekdays[f] == null ? "" : String(weekdays[f]);
  }
  return out;
}

export function WeekdayMinimumsModal({ open, onClose, locations }: Props) {
  const { t, dir } = useI18n();
  const { showToast } = useToast();
  const tW = useCallback(
    (key: string, vars?: Record<string, string | number>) =>
      t(`ops.inventory.warehouse.weekdayMinimums.${key}`, vars),
    [t],
  );

  const [locationId, setLocationId] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [rows, setRows] = useState<EditedRow[]>([]);
  const [baseline, setBaseline] = useState<EditedRow[]>([]);

  const sortedLocations = useMemo(
    () => [...locations].sort((a, b) => a.name.localeCompare(b.name, "he")),
    [locations],
  );

  useEffect(() => {
    if (!open) return;
    setLocationId(sortedLocations[0]?.id ?? "");
    setRows([]);
    setBaseline([]);
    setError(null);
    setSuccess(false);
  }, [open, sortedLocations]);

  const load = useCallback(async () => {
    if (!locationId) return;
    setLoading(true);
    setError(null);
    setSuccess(false);
    try {
      const res = await fetch(
        `/api/inventory/weekday-minimums?locationId=${encodeURIComponent(locationId)}`,
        { credentials: "same-origin", cache: "no-store" },
      );
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        data?: { rows: WeekdayRow[] };
      };
      if (!res.ok || !json.ok) {
        throw new Error(json.error || tW("loadFailed"));
      }
      const edited = (json.data?.rows ?? []).map((r) => ({
        productId: r.productId,
        name: r.name,
        weekdays: emptyEdited(r.weekdays),
      }));
      setRows(edited);
      setBaseline(edited.map((r) => ({
        productId: r.productId,
        name: r.name,
        weekdays: { ...r.weekdays },
      })));
    } catch (e) {
      setError(e instanceof Error ? e.message : tW("loadFailed"));
      setRows([]);
      setBaseline([]);
    } finally {
      setLoading(false);
    }
  }, [locationId, tW]);

  useEffect(() => {
    if (!open || !locationId) return;
    void load();
  }, [open, locationId, load]);

  const isDirty = useMemo(() => {
    if (rows.length !== baseline.length) return true;
    for (let i = 0; i < rows.length; i++) {
      const a = rows[i];
      const b = baseline.find((x) => x.productId === a.productId);
      if (!b) return true;
      for (const f of WEEKDAY_MINIMUM_FIELDS) {
        if (a.weekdays[f] !== b.weekdays[f]) return true;
      }
    }
    return false;
  }, [rows, baseline]);

  const setCell = (productId: string, field: WeekdayMinimumField, value: string) => {
    setRows((prev) =>
      prev.map((r) =>
        r.productId === productId
          ? { ...r, weekdays: { ...r.weekdays, [field]: value.replace(/[^\d.]/g, "") } }
          : r,
      ),
    );
    setSuccess(false);
  };

  const copyWeek = (productId: string) => {
    const row = rows.find((r) => r.productId === productId);
    if (!row) return;
    const firstWithValue = WEEKDAY_MINIMUM_FIELDS.find((f) => row.weekdays[f].trim() !== "");
    const src = firstWithValue ? row.weekdays[firstWithValue] : row.weekdays.minimumSun;
    if (!src.trim()) return;
    setRows((prev) =>
      prev.map((r) =>
        r.productId === productId
          ? {
              ...r,
              weekdays: Object.fromEntries(
                WEEKDAY_MINIMUM_FIELDS.map((f) => [f, src]),
              ) as Record<WeekdayMinimumField, string>,
            }
          : r,
      ),
    );
    setSuccess(false);
  };

  const save = async () => {
    if (!locationId || !isDirty) return;
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const patchRows = rows.map((r) => {
        const out: Record<string, unknown> = { productId: r.productId };
        const base = baseline.find((b) => b.productId === r.productId);
        for (const f of WEEKDAY_MINIMUM_FIELDS) {
          if (!base || r.weekdays[f] !== base.weekdays[f]) {
            const raw = r.weekdays[f].trim();
            out[f] = raw === "" ? null : Number(raw);
          }
        }
        return out;
      });

      const res = await fetch("/api/inventory/weekday-minimums", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locationId, rows: patchRows }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        throw new Error(json.error || tW("saveFailed"));
      }
      setBaseline(rows.map((r) => ({
        productId: r.productId,
        name: r.name,
        weekdays: { ...r.weekdays },
      })));
      setSuccess(true);
      showToast({ tone: "success", title: tW("saveSuccess") });
    } catch (e) {
      const msg = e instanceof Error ? e.message : tW("saveFailed");
      setError(msg);
      showToast({ tone: "error", title: msg });
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4"
      dir={dir}
      role="dialog"
      aria-modal="true"
      aria-labelledby="weekday-minimums-title"
    >
      <div className="flex h-[min(96vh,900px)] w-full max-w-6xl flex-col rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-[#e7ecf5] px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <h2
              id="weekday-minimums-title"
              className="flex items-center gap-2 text-lg font-black text-slate-900"
            >
              <CalendarDays className="h-5 w-5 shrink-0 text-[#6c4cff]" aria-hidden />
              {tW("title")}
            </h2>
            <p className="mt-1 text-xs font-semibold text-slate-500">{tW("hint")}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-[#e7ecf5] text-slate-600 hover:bg-slate-50"
            aria-label={tW("close")}
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="shrink-0 border-b border-[#e7ecf5] px-4 py-3 sm:px-5">
          <label className="mb-1 block text-xs font-black text-slate-600">{tW("location")}</label>
          <select
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
            className="w-full rounded-xl border border-[#e7ecf5] bg-white px-3 py-2.5 text-sm font-bold text-slate-800 outline-none focus:border-[#6c4cff] focus:ring-2 focus:ring-[#6c4cff]/20 sm:max-w-md"
          >
            {sortedLocations.map((loc) => (
              <option key={loc.id} value={loc.id}>{loc.name}</option>
            ))}
          </select>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-2 py-2 sm:px-4">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm font-bold text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin text-[#6c4cff]" />
              {tW("loading")}
            </div>
          ) : error && rows.length === 0 ? (
            <p className="py-12 text-center text-sm font-bold text-rose-600">{error}</p>
          ) : rows.length === 0 ? (
            <p className="py-12 text-center text-sm font-bold text-slate-500">{tW("empty")}</p>
          ) : (
            <table className="w-full min-w-[640px] border-collapse text-xs sm:text-sm">
              <thead className="sticky top-0 z-10 bg-slate-50">
                <tr className="border-b border-[#e7ecf5]">
                  <th className="px-2 py-2 text-end font-black text-slate-700">{tW("productCol")}</th>
                  {WEEKDAY_I18N_KEYS.map((field) => (
                    <th key={field} className="px-1 py-2 text-center font-black text-slate-600">
                      {tW(`days.${field}`)}
                    </th>
                  ))}
                  <th className="px-1 py-2 text-center font-black text-slate-600">{tW("copyWeek")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.productId} className="border-b border-[#e7ecf5]/80">
                    <td className="max-w-[12rem] px-2 py-2 text-end font-bold text-slate-900">
                      <span className="line-clamp-2">{row.name}</span>
                    </td>
                    {WEEKDAY_I18N_KEYS.map((field) => (
                      <td key={field} className="px-1 py-1">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={row.weekdays[field]}
                          onChange={(e) => setCell(row.productId, field, e.target.value)}
                          className="h-9 w-full min-w-[2.5rem] rounded-lg border border-[#e7ecf5] bg-white px-1 text-center text-sm font-black tabular-nums outline-none focus:border-[#6c4cff] focus:ring-1 focus:ring-[#6c4cff]/30"
                          aria-label={`${row.productId} ${tW(`days.${field}`)}`}
                        />
                      </td>
                    ))}
                    <td className="px-1 py-1 text-center">
                      <button
                        type="button"
                        onClick={() => copyWeek(row.productId)}
                        className="rounded-lg px-2 py-1 text-[10px] font-black text-[#6c4cff] hover:bg-[#f5f3ff]"
                      >
                        {tW("copyWeekShort")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <footer className="shrink-0 border-t border-[#e7ecf5] px-4 py-3 sm:px-5">
          {error && rows.length > 0 ? (
            <p className="mb-2 text-center text-xs font-bold text-rose-600">{error}</p>
          ) : null}
          {success ? (
            <p className="mb-2 flex items-center justify-center gap-1 text-xs font-bold text-emerald-700">
              <Check className="h-3.5 w-3.5" aria-hidden />
              {tW("saveSuccess")}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-[#e7ecf5] px-4 py-2.5 text-sm font-black text-slate-700 hover:bg-slate-50"
            >
              {tW("close")}
            </button>
            <button
              type="button"
              disabled={!isDirty || saving || loading}
              onClick={() => void save()}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-5 text-sm font-black text-white shadow-md disabled:opacity-50"
              style={{ background: "#6c4cff" }}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              {tW("save")}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
