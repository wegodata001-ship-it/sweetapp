"use client";

import { Copy, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/i18n-provider";

export type TaskGroupMenuAction = "edit" | "duplicate" | "delete";

type Props = {
  onAction: (action: TaskGroupMenuAction) => void;
  busy?: boolean;
};

/**
 * ⋮ actions on template cards — dropdown on desktop, bottom sheet on mobile.
 */
export function TaskGroupCardMenu({ onAction, busy }: Props) {
  const { t, dir } = useI18n();
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

  const pick = (action: TaskGroupMenuAction) => {
    setOpen(false);
    onAction(action);
  };

  const items: { id: TaskGroupMenuAction; icon: typeof Pencil; label: string; danger?: boolean }[] =
    [
      { id: "edit", icon: Pencil, label: t("workflows.cards.menuEdit") },
      { id: "duplicate", icon: Copy, label: t("workflows.cards.menuDuplicate") },
      { id: "delete", icon: Trash2, label: t("workflows.cards.menuDelete"), danger: true },
    ];

  return (
    <div ref={rootRef} className="relative shrink-0" dir={dir}>
      <button
        type="button"
        disabled={busy}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="grid h-8 w-8 place-items-center rounded-lg bg-white/70 text-slate-800 shadow-sm ring-1 ring-white/80 transition hover:bg-white disabled:opacity-50"
        aria-label={t("workflows.cards.menuLabel")}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <MoreVertical className="h-4 w-4" aria-hidden />
      </button>

      {open ? (
        <>
          <div
            className="fixed inset-0 z-[60] bg-black/40 sm:hidden"
            aria-hidden
            onClick={() => setOpen(false)}
          />
          <ul
            role="menu"
            className="fixed inset-x-3 bottom-3 z-[61] overflow-hidden rounded-2xl bg-white py-1 shadow-2xl ring-1 ring-slate-200 sm:absolute sm:inset-auto sm:bottom-auto sm:end-0 sm:top-full sm:mt-1 sm:w-44 sm:rounded-xl"
          >
            {items.map(({ id, icon: Icon, label, danger }) => (
              <li key={id} role="none">
                <button
                  type="button"
                  role="menuitem"
                  onClick={(e) => {
                    e.stopPropagation();
                    pick(id);
                  }}
                  className={`flex w-full items-center gap-2 px-3 py-2.5 text-start text-sm font-bold transition hover:bg-slate-50 sm:py-2 sm:text-xs ${
                    danger ? "text-rose-700 hover:bg-rose-50" : "text-slate-800"
                  }`}
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
