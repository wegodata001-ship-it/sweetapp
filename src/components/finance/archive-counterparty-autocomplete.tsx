"use client";

import { Loader2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import type {
  ArchiveCounterpartyKind,
  ArchiveCounterpartyKindFilter,
} from "@/lib/finance/counterparty-filter";
import { encodeArchiveCounterpartyKey } from "@/lib/finance/counterparty-filter";

export type ArchiveCounterpartyOption = {
  kind: ArchiveCounterpartyKind;
  id: string;
  name: string;
};

type Props = {
  valueKey: string;
  onChange: (key: string, option: ArchiveCounterpartyOption | null) => void;
  kindFilter?: ArchiveCounterpartyKindFilter;
  className?: string;
};

function optionKey(opt: ArchiveCounterpartyOption): string {
  return encodeArchiveCounterpartyKey(opt.kind, opt.id);
}

export function ArchiveCounterpartyAutocomplete({
  valueKey,
  onChange,
  kindFilter = "",
  className,
}: Props) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [options, setOptions] = useState<ArchiveCounterpartyOption[]>([]);
  const [selectedLabel, setSelectedLabel] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);

  const prefixForKind = useCallback(
    (kind: ArchiveCounterpartyKind) => {
      switch (kind) {
        case "customer":
          return t("archiveCounterparty.customerPrefix");
        case "supplier":
          return t("archiveCounterparty.supplierPrefix");
        case "employee":
          return t("archiveCounterparty.employeePrefix");
      }
    },
    [t],
  );

  const formatOption = useCallback(
    (opt: ArchiveCounterpartyOption) => `${prefixForKind(opt.kind)} ${opt.name}`,
    [prefixForKind],
  );

  const fetchOptions = useCallback(
    async (q: string) => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (q.trim()) params.set("q", q.trim());
        if (kindFilter) params.set("kind", kindFilter);
        const res = await fetch(`/api/finance/counterparties?${params}`, {
          credentials: "same-origin",
        });
        const j = (await res.json()) as { ok?: boolean; data?: ArchiveCounterpartyOption[] };
        setOptions(j.ok && Array.isArray(j.data) ? j.data : []);
      } finally {
        setLoading(false);
      }
    },
    [kindFilter],
  );

  useEffect(() => {
    if (!valueKey) {
      setSelectedLabel("");
      return;
    }
    void (async () => {
      const params = new URLSearchParams();
      if (kindFilter) params.set("kind", kindFilter);
      const all = await fetch(`/api/finance/counterparties?${params}`, { credentials: "same-origin" })
        .then((r) => r.json())
        .then((j: { data?: ArchiveCounterpartyOption[] }) => j.data ?? [])
        .catch(() => [] as ArchiveCounterpartyOption[]);
      const hit = all.find((o) => optionKey(o) === valueKey);
      if (hit) setSelectedLabel(formatOption(hit));
    })();
  }, [valueKey, kindFilter, formatOption]);

  useEffect(() => {
    setOptions([]);
    const timer = setTimeout(() => {
      if (open) void fetchOptions(query);
    }, 200);
    return () => clearTimeout(timer);
  }, [query, open, fetchOptions, kindFilter]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) =>
        o.name.toLowerCase().includes(q) ||
        prefixForKind(o.kind).toLowerCase().includes(q),
    );
  }, [options, query, prefixForKind]);

  const displayValue = open ? query : selectedLabel || query;

  return (
    <div ref={wrapRef} className={`relative ${className ?? ""}`}>
      <div className="relative">
        <input
          type="text"
          value={displayValue}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelectedLabel("");
            if (valueKey) onChange("", null);
            setOpen(true);
          }}
          onFocus={() => {
            setOpen(true);
            if (!options.length) void fetchOptions(query);
          }}
          placeholder={t("archiveCounterparty.placeholder")}
          className="h-[42px] w-full rounded-xl border border-slate-300 bg-white pe-9 ps-3 text-right text-sm font-semibold outline-none focus:border-cyan-600 focus:ring-1 focus:ring-cyan-600/25"
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
        />
        {(valueKey || query || selectedLabel) && !loading ? (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setSelectedLabel("");
              onChange("", null);
              setOpen(false);
            }}
            className="absolute end-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label={t("common.remove")}
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      {open ? (
        <ul
          className="absolute z-40 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
          role="listbox"
        >
          <li>
            <button
              type="button"
              role="option"
              className="flex w-full px-3 py-2.5 text-start text-sm font-bold text-slate-600 hover:bg-slate-50"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setQuery("");
                setSelectedLabel("");
                onChange("", null);
                setOpen(false);
              }}
            >
              {t("archiveCounterparty.allParties")}
            </button>
          </li>
          {loading ? (
            <li className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-cyan-700" aria-hidden />
            </li>
          ) : filtered.length === 0 ? (
            <li className="px-3 py-3 text-center text-xs font-semibold text-slate-500">
              {t("common.noResults")}
            </li>
          ) : (
            filtered.map((opt) => (
              <li key={optionKey(opt)}>
                <button
                  type="button"
                  role="option"
                  aria-selected={valueKey === optionKey(opt)}
                  className={`flex w-full px-3 py-2.5 text-start text-sm font-semibold hover:bg-cyan-50 ${
                    valueKey === optionKey(opt) ? "bg-cyan-50 text-cyan-950" : "text-slate-800"
                  }`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setSelectedLabel(formatOption(opt));
                    setQuery("");
                    onChange(optionKey(opt), opt);
                    setOpen(false);
                  }}
                >
                  {formatOption(opt)}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
