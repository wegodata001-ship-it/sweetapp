"use client";

import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/i18n-provider";

export type LibraryTaskOption = {
  id: string;
  title: string;
  description: string | null;
  estimatedMinutes: number;
};

export function TaskLibraryAutocomplete({
  value,
  onChange,
  onPick,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  onPick?: (opt: LibraryTaskOption) => void;
  placeholder?: string;
  className?: string;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [options, setOptions] = useState<LibraryTaskOption[]>([]);
  const wrapRef = useRef<HTMLDivElement>(null);

  const search = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/work-library?q=${encodeURIComponent(q)}`,
        { credentials: "same-origin" },
      );
      const j = (await res.json()) as { ok?: boolean; data?: LibraryTaskOption[] };
      setOptions(j.ok && Array.isArray(j.data) ? j.data : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const tmr = setTimeout(() => {
      if (value.trim().length >= 1) void search(value);
      else setOptions([]);
    }, 200);
    return () => clearTimeout(tmr);
  }, [value, search]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div ref={wrapRef} className={`relative ${className ?? ""}`}>
      <input
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder ?? t("workflows.employeeWork.taskSearchPh")}
        className="h-10 w-full rounded-xl bg-white px-3 text-sm font-bold ring-1 ring-slate-200"
        autoComplete="off"
      />
      {open && (options.length > 0 || loading) ? (
        <ul
          className="absolute z-30 mt-1 max-h-48 w-full overflow-y-auto rounded-xl bg-white py-1 shadow-lg ring-1 ring-slate-200"
          role="listbox"
        >
          {loading ? (
            <li className="flex justify-center py-3">
              <Loader2 className="h-5 w-5 animate-spin text-violet-600" />
            </li>
          ) : (
            options.map((opt) => (
              <li key={opt.id}>
                <button
                  type="button"
                  role="option"
                  className="flex w-full flex-col px-3 py-2 text-start hover:bg-violet-50"
                  onClick={() => {
                    onChange(opt.title);
                    onPick?.(opt);
                    setOpen(false);
                  }}
                >
                  <span className="text-sm font-black text-slate-900">{opt.title}</span>
                  <span className="text-[10px] font-bold text-slate-500">
                    {opt.estimatedMinutes}&apos; {t("workflows.employeeWork.fromLibrary")}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
