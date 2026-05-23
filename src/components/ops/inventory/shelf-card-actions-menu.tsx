"use client";

import { Copy, MoreVertical, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/i18n-provider";

export type ShelfCardMenuAction = "addProducts" | "duplicate" | "delete";

type Props = {
  onAction: (action: ShelfCardMenuAction) => void;
  busy?: boolean;
  disabled?: boolean;
  disabledTitle?: string;
  variant?: "dark" | "light";
};

export function ShelfCardActionsMenu({
  onAction,
  busy,
  disabled,
  disabledTitle,
  variant = "dark",
}: Props) {
  const { t, dir } = useI18n();
  const tMenu = (key: string) => t(`ops.inventory.warehouse.card.menu.${key}`);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const pick = (action: ShelfCardMenuAction) => {
    setOpen(false);
    if (disabled) return;
    onAction(action);
  };

  const items: {
    id: ShelfCardMenuAction;
    icon: typeof Plus;
    label: string;
    className: string;
  }[] = [
    {
      id: "addProducts",
      icon: Plus,
      label: tMenu("addProducts"),
      className: "text-[#2563eb] hover:bg-blue-50",
    },
    {
      id: "duplicate",
      icon: Copy,
      label: tMenu("duplicate"),
      className: "text-[#6c4cff] hover:bg-violet-50",
    },
    {
      id: "delete",
      icon: Trash2,
      label: tMenu("delete"),
      className: "text-rose-700 hover:bg-rose-50",
    },
  ];

  return (
    <div ref={rootRef} className="relative shrink-0" dir={dir}>
      <button
        type="button"
        disabled={busy || disabled}
        title={disabled ? disabledTitle : tMenu("label")}
        onClick={(e) => {
          e.stopPropagation();
          if (disabled) return;
          setOpen((v) => !v);
        }}
        className={`grid h-8 w-8 place-items-center rounded-xl shadow-sm ring-1 transition disabled:cursor-not-allowed disabled:opacity-45 ${
          variant === "light"
            ? "bg-slate-100 text-slate-600 ring-slate-200 hover:bg-slate-200 hover:text-slate-900"
            : "bg-white/10 text-white/80 ring-white/15 hover:bg-white/20 hover:text-white"
        }`}
        aria-label={tMenu("label")}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <MoreVertical className="h-4 w-4" aria-hidden />
      </button>

      {open && !disabled ? (
        <>
          <div
            className="fixed inset-0 z-[60] bg-black/30 sm:hidden"
            aria-hidden
            onClick={() => setOpen(false)}
          />
          <ul
            role="menu"
            className="fixed inset-x-3 bottom-3 z-[61] overflow-hidden rounded-2xl bg-white py-1 shadow-[0_12px_40px_rgba(15,23,42,0.12)] ring-1 ring-[#e7ecf5] sm:absolute sm:inset-auto sm:bottom-auto sm:start-0 sm:top-full sm:mt-1.5 sm:w-48 sm:rounded-xl"
          >
            {items.map(({ id, icon: Icon, label, className }) => (
              <li key={id} role="none">
                <button
                  type="button"
                  role="menuitem"
                  onClick={(e) => {
                    e.stopPropagation();
                    pick(id);
                  }}
                  className={`flex w-full items-center gap-2.5 px-3.5 py-2.5 text-start text-sm font-bold transition sm:py-2 sm:text-xs ${className}`}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden />
                  {label}
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}
