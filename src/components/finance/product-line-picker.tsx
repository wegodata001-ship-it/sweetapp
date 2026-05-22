"use client";

import { Loader2, Plus } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@/components/i18n-provider";
import { useProductPickerCatalogContext } from "@/components/finance/product-picker-catalog-context";
import { useProductPickerSearch } from "@/components/finance/use-product-picker-catalog";
import type { ProductPickerRow } from "@/lib/finance/product-picker-catalog";
import { formatShekel } from "@/lib/format-shekel";

type Props = {
  value: string;
  onChange: (name: string) => void;
  onSelect: (row: ProductPickerRow) => void;
  supplierId?: string | null;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  autoOpen?: boolean;
  onAutoOpenDone?: () => void;
  /** נקרא כשהשדה מקבל פוקוס — למשל לבחירת שורת יעד במחירון ספק */
  onFocusLine?: () => void;
};

const LIST_MAX_H = 320;
const MENU_Z = 9999;
const GAP = 6;

type MenuRect = {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
};

function computeMenuRect(input: HTMLInputElement, dir: "rtl" | "ltr"): MenuRect {
  const rect = input.getBoundingClientRect();
  const pad = 8;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(Math.max(rect.width, 288), vw - pad * 2);
  const spaceBelow = vh - rect.bottom - GAP;
  const spaceAbove = rect.top - GAP;
  const openBelow = spaceBelow >= 160 || spaceBelow >= spaceAbove;
  const maxHeight = Math.min(
    LIST_MAX_H,
    Math.max(120, (openBelow ? spaceBelow : spaceAbove) - pad),
  );
  const top = openBelow ? rect.bottom + GAP : Math.max(pad, rect.top - GAP - maxHeight);
  let left = dir === "rtl" ? rect.right - width : rect.left;
  left = Math.max(pad, Math.min(left, vw - width - pad));
  return { top, left, width, maxHeight };
}

export function ProductLinePicker({
  value,
  onChange,
  onSelect,
  supplierId,
  placeholder,
  className,
  disabled = false,
  autoOpen = false,
  onAutoOpenDone,
  onFocusLine,
}: Props) {
  const { t, dir } = useI18n();
  const listboxId = useId();
  const sharedCtx = useProductPickerCatalogContext();
  const local = useProductPickerSearch(supplierId);
  const { rows, loading, hasMore, search, loadMore, appendToCache: localAppend } = local;
  const appendToCache = sharedCtx?.appendToCache ?? localAppend;
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [menuRect, setMenuRect] = useState<MenuRect | null>(null);
  const [highlight, setHighlight] = useState(0);
  const [mounted, setMounted] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open || disabled) return;
    search(value, !value.trim());
  }, [value, open, disabled, search]);

  const filtered = rows;

  const exactMatch = useMemo(
    () => rows.some((p) => p.name.trim().toLowerCase() === value.trim().toLowerCase()),
    [rows, value],
  );

  const showAddNew = value.trim().length > 0 && !exactMatch;
  const optionCount = filtered.length + (showAddNew ? 1 : 0);

  const openList = open && !disabled && (loading || filtered.length > 0 || showAddNew);

  const updateMenuPosition = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    setMenuRect(computeMenuRect(el, dir));
  }, [dir]);

  useEffect(() => {
    if (!openList) {
      setMenuRect(null);
      return;
    }
    updateMenuPosition();
    const onScrollOrResize = () => updateMenuPosition();
    window.addEventListener("resize", onScrollOrResize);
    window.addEventListener("scroll", onScrollOrResize, true);
    return () => {
      window.removeEventListener("resize", onScrollOrResize);
      window.removeEventListener("scroll", onScrollOrResize, true);
    };
  }, [openList, updateMenuPosition]);

  useEffect(() => {
    if (autoOpen && !disabled) {
      setOpen(true);
      queueMicrotask(() => inputRef.current?.focus());
      onAutoOpenDone?.();
    }
  }, [autoOpen, disabled, onAutoOpenDone]);

  useEffect(() => {
    setHighlight(0);
  }, [value, filtered.length, showAddNew]);

  useEffect(() => {
    if (!openList) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t) || listRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [openList]);

  const pick = (row: ProductPickerRow) => {
    onChange(row.name);
    onSelect(row);
    setOpen(false);
  };

  const addNewProduct = async () => {
    const name = value.trim();
    if (!name || creating) return;
    setCreating(true);
    try {
      const res = await fetch("/api/finance/product-picker", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          price: 0,
          supplierId: supplierId ?? null,
        }),
      });
      const j = (await res.json()) as { ok?: boolean; data?: ProductPickerRow; error?: string };
      if (!j.ok || !j.data) {
        alert(j.error ?? t("common.error"));
        return;
      }
      appendToCache(j.data);
      pick(j.data);
    } finally {
      setCreating(false);
    }
  };

  const pickHighlighted = () => {
    if (loading) return;
    if (highlight < filtered.length) {
      pick(filtered[highlight]!);
      return;
    }
    if (showAddNew) void addNewProduct();
  };

  useEffect(() => {
    if (!openList || !listRef.current) return;
    const el = listRef.current.querySelector('[aria-selected="true"]');
    el?.scrollIntoView({ block: "nearest" });
  }, [highlight, openList]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "Enter") {
        setOpen(true);
        e.preventDefault();
      }
      return;
    }
    if (e.key === "Escape") {
      setOpen(false);
      e.preventDefault();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, Math.max(0, optionCount - 1)));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
      return;
    }
    if (e.key === "Enter" && openList) {
      e.preventDefault();
      pickHighlighted();
    }
  };

  const dropdown =
    openList && menuRect && mounted
      ? createPortal(
          <ul
            ref={listRef}
            role="listbox"
            dir={dir}
            className="fixed overflow-y-auto overscroll-contain rounded-2xl border border-slate-200/90 bg-white py-1 text-right shadow-[0_16px_48px_rgba(15,23,42,0.18)]"
            style={{
              zIndex: MENU_Z,
              top: menuRect.top,
              left: menuRect.left,
              width: menuRect.width,
              maxHeight: menuRect.maxHeight,
            }}
            onScroll={(e) => {
              const el = e.currentTarget;
              if (el.scrollTop + el.clientHeight >= el.scrollHeight - 48) {
                loadMore(value);
              }
            }}
          >
            {loading ? (
              <li className="flex justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-cyan-600" aria-hidden />
              </li>
            ) : filtered.length === 0 && !showAddNew ? (
              <li className="px-4 py-4 text-center text-xs font-bold text-slate-500">
                {t("register.lines.productPickerEmpty")}
              </li>
            ) : (
              filtered.map((row, idx) => (
                <li key={row.key}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={highlight === idx}
                    className={`flex w-full min-h-[48px] flex-col gap-1 px-4 py-3 text-right transition touch-manipulation ${
                      highlight === idx ? "bg-cyan-50" : "hover:bg-slate-50 active:bg-cyan-100"
                    }`}
                    onMouseDown={(ev) => ev.preventDefault()}
                    onMouseEnter={() => setHighlight(idx)}
                    onClick={() => pick(row)}
                  >
                    <span className="whitespace-normal break-words text-sm font-black leading-snug text-slate-900">
                      {row.name}
                    </span>
                    <span className="whitespace-normal break-words text-[11px] font-bold leading-snug text-slate-600">
                      {row.lastPrice > 0 ? formatShekel(row.lastPrice) : "—"}
                      {row.unit ? ` · ${row.unit}` : ""}
                      {row.supplierName
                        ? ` · ${t("register.lines.productSupplier")}: ${row.supplierName}`
                        : ""}
                    </span>
                  </button>
                </li>
              ))
            )}
            {showAddNew ? (
              <li className="sticky bottom-0 border-t border-slate-100 bg-white">
                <button
                  type="button"
                  disabled={creating}
                  role="option"
                  aria-selected={highlight === filtered.length}
                  className={`flex w-full min-h-[48px] items-center justify-end gap-2 px-4 py-3 text-sm font-black text-cyan-800 touch-manipulation ${
                    highlight === filtered.length ? "bg-cyan-50" : "hover:bg-cyan-50"
                  }`}
                  onMouseDown={(ev) => ev.preventDefault()}
                  onMouseEnter={() => setHighlight(filtered.length)}
                  onClick={() => void addNewProduct()}
                >
                  {creating ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <Plus className="h-4 w-4 shrink-0" aria-hidden />
                  )}
                  <span className="whitespace-normal break-words text-right">
                    {t("register.lines.addNewProduct", { name: value.trim() })}
                  </span>
                </button>
              </li>
            ) : null}
          </ul>,
          document.body,
        )
      : null;

  return (
    <div ref={wrapRef} className={`min-w-[12rem] ${className ?? ""}`} dir={dir}>
      <input
        ref={inputRef}
        type="text"
        disabled={disabled}
        value={value}
        autoComplete="off"
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          onFocusLine?.();
          setOpen(true);
        }}
        onClick={() => {
          setOpen(true);
          updateMenuPosition();
        }}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className="h-11 min-h-[44px] w-full rounded-[16px] border border-slate-200 px-2 text-right text-sm outline-none focus:border-luxury-gold focus:ring-1 focus:ring-luxury-gold/25"
        aria-expanded={openList}
        aria-haspopup="listbox"
        aria-controls={openList ? listboxId : undefined}
      />
      {dropdown}
    </div>
  );
}
