"use client";

import { Filter, Search } from "lucide-react";

type Props = {
  shelfSearch: string;
  onShelfSearch: (v: string) => void;
  filterArea: string;
  onFilterArea: (v: string) => void;
  areas: { id: string; name: string }[];
  filterShortageOnly: boolean;
  onFilterShortageOnly: (v: boolean) => void;
  filterOkOnly: boolean;
  onFilterOkOnly: (v: boolean) => void;
  searchPlaceholder: string;
  areaLabel: string;
  areaAll: string;
  shortageLabel: string;
  okLabel: string;
};

export function InventoryFilters({
  shelfSearch,
  onShelfSearch,
  filterArea,
  onFilterArea,
  areas,
  filterShortageOnly,
  onFilterShortageOnly,
  filterOkOnly,
  onFilterOkOnly,
  searchPlaceholder,
  areaLabel,
  areaAll,
  shortageLabel,
  okLabel,
}: Props) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-3 shadow-sm md:p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={shelfSearch}
            onChange={(e) => onShelfSearch(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2.5 pe-10 ps-3 text-sm font-medium outline-none transition focus:border-sky-400 focus:bg-white focus:ring-2 focus:ring-sky-100"
          />
        </div>
        <label className="flex shrink-0 flex-col gap-1 text-xs font-bold text-slate-600 sm:min-w-[160px]">
          <span className="flex items-center gap-1">
            <Filter className="h-3.5 w-3.5" aria-hidden />
            {areaLabel}
          </span>
          <select
            value={filterArea}
            onChange={(e) => onFilterArea(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold"
          >
            <option value="">{areaAll}</option>
            {areas.map((a) => (
              <option key={a.id} value={a.name}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            onFilterShortageOnly(!filterShortageOnly);
            if (!filterShortageOnly) onFilterOkOnly(false);
          }}
          className={`rounded-full px-3 py-1.5 text-xs font-bold ring-1 transition ${
            filterShortageOnly
              ? "bg-rose-100 text-rose-900 ring-rose-200"
              : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"
          }`}
        >
          ⚠ {shortageLabel}
        </button>
        <button
          type="button"
          onClick={() => {
            onFilterOkOnly(!filterOkOnly);
            if (!filterOkOnly) onFilterShortageOnly(false);
          }}
          className={`rounded-full px-3 py-1.5 text-xs font-bold ring-1 transition ${
            filterOkOnly
              ? "bg-emerald-100 text-emerald-900 ring-emerald-200"
              : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"
          }`}
        >
          ✅ {okLabel}
        </button>
      </div>
    </div>
  );
}
