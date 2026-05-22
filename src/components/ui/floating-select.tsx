"use client";

import { ChevronDown, Search } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@/components/i18n-provider";
import { computeFloatingMenuRect, FLOATING_MENU_Z } from "@/lib/ui/floating-menu-position";

export type FloatingSelectOption = { value: string; label: string };

type Props = {
  value: string;
  onChange: (value: string) => void;
  options: FloatingSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  searchable?: boolean;
  className?: string;
  emptyLabel?: string;
};

export function FloatingSelect({
  value,
  onChange,
  options,
  placeholder,
  disabled = false,
  searchable = false,
  className,
  emptyLabel,
}: Props) {
  const { t, dir } = useI18n();
  const listboxId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [menuRect, setMenuRect] = useState<ReturnType<typeof computeFloatingMenuRect> | null>(null);
  const [highlight, setHighlight] = useState(0);
  const [mounted, setMounted] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selected = options.find((o) => o.value === value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q));
  }, [options, query]);

  useEffect(() => setMounted(true), []);

  const updatePosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    setMenuRect(computeFloatingMenuRect(el, dir, { minWidth: 280, maxHeight: 280 }));
  }, [dir]);

  useEffect(() => {
    if (!open) {
      setMenuRect(null);
      setQuery("");
      return;
    }
    updatePosition();
    const onScroll = () => updatePosition();
    window.addEventListener("resize", onScroll);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("resize", onScroll);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const n = e.target as Node;
      if (wrapRef.current?.contains(n) || listRef.current?.contains(n)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => setHighlight(0), [query, filtered.length]);

  const pick = (opt: FloatingSelectOption) => {
    onChange(opt.value);
    setOpen(false);
  };

  const menu =
    open && menuRect && mounted ? (
      createPortal(
        <div
          className="fixed"
          style={{ zIndex: FLOATING_MENU_Z, top: menuRect.top, left: menuRect.left, width: menuRect.width }}
        >
          {searchable ? (
            <div className="mb-1 rounded-t-2xl border border-b-0 border-slate-200 bg-white p-2 shadow-lg">
              <div className="relative">
                <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t("common.search")}
                  className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pe-3 ps-9 text-sm outline-none focus:border-luxury-gold focus:ring-1 focus:ring-luxury-gold/30"
                  autoFocus
                />
              </div>
            </div>
          ) : null}
          <ul
            ref={listRef}
            id={listboxId}
            role="listbox"
            dir={dir}
            className={`overflow-y-auto overscroll-contain rounded-2xl border border-slate-200/90 bg-white py-1 text-right shadow-[0_16px_48px_rgba(15,23,42,0.18)] ${searchable ? "rounded-t-none border-t-0" : ""}`}
            style={{ maxHeight: menuRect.maxHeight }}
          >
            {filtered.length === 0 ? (
              <li className="px-4 py-4 text-center text-xs font-bold text-slate-500">
                {emptyLabel ?? t("common.noResults")}
              </li>
            ) : (
              filtered.map((opt, idx) => (
                <li key={opt.value}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={value === opt.value || highlight === idx}
                    className={`flex w-full min-h-[44px] items-center px-4 py-2.5 text-sm font-bold transition touch-manipulation ${
                      value === opt.value
                        ? "bg-luxury-gold/15 text-luxury-charcoal"
                        : highlight === idx
                          ? "bg-slate-50"
                          : "hover:bg-slate-50"
                    }`}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setHighlight(idx)}
                    onClick={() => pick(opt)}
                  >
                    <span className="w-full whitespace-normal break-words text-start">{opt.label}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>,
        document.body,
      )
    ) : null;

  return (
    <div ref={wrapRef} className={className} dir={dir}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          setOpen((o) => !o);
          if (!open) queueMicrotask(updatePosition);
        }}
        className="flex h-11 min-h-[44px] w-full items-center justify-between gap-2 rounded-[16px] border border-slate-300 bg-white px-3 text-sm font-bold text-slate-900 shadow-sm transition hover:border-luxury-gold focus:border-luxury-gold focus:outline-none focus:ring-2 focus:ring-luxury-gold/25 disabled:opacity-50"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? listboxId : undefined}
      >
        <span className={`min-w-0 flex-1 truncate text-start ${!selected ? "text-slate-400" : ""}`}>
          {selected?.label ?? placeholder ?? "—"}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-500 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {menu}
    </div>
  );
}
