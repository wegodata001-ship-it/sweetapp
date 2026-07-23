"use client";

import {
  Copy,
  Download,
  History,
  MoreVertical,
  Pencil,
  Plus,
  Trash2,
  ArrowRightLeft,
} from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@/components/i18n-provider";
import {
  computeDropdownMenuPosition,
  FLOATING_MENU_Z,
  type DropdownMenuPosition,
} from "@/lib/ui/floating-menu-position";

export type ShelfCardMenuAction =
  | "edit"
  | "addProducts"
  | "duplicate"
  | "transfer"
  | "export"
  | "history"
  | "delete";

type Props = {
  onAction: (action: ShelfCardMenuAction) => void;
  busy?: boolean;
  disabled?: boolean;
  disabledTitle?: string;
  variant?: "dark" | "light";
};

const MENU_WIDTH = 220;
const MENU_ITEM_HEIGHT = 40;
const MENU_PADDING = 8;

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
  const [entered, setEntered] = useState(false);
  const [position, setPosition] = useState<DropdownMenuPosition | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
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

  const items: {
    id: ShelfCardMenuAction;
    icon: typeof Plus;
    label: string;
    className: string;
  }[] = [
    { id: "edit", icon: Pencil, label: tMenu("edit"), className: "text-slate-800 hover:bg-slate-50" },
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
      id: "transfer",
      icon: ArrowRightLeft,
      label: tMenu("transfer"),
      className: "text-cyan-700 hover:bg-cyan-50",
    },
    {
      id: "export",
      icon: Download,
      label: tMenu("export"),
      className: "text-emerald-700 hover:bg-emerald-50",
    },
    {
      id: "history",
      icon: History,
      label: tMenu("history"),
      className: "text-amber-800 hover:bg-amber-50",
    },
    {
      id: "delete",
      icon: Trash2,
      label: tMenu("delete"),
      className: "text-rose-700 hover:bg-rose-50",
    },
  ];

  const estimatedMenuHeight = MENU_ITEM_HEIGHT * items.length + MENU_PADDING;

  const updatePosition = useCallback(() => {
    const el = btnRef.current;
    if (!el) return;
    setPosition(
      computeDropdownMenuPosition(el, dir, {
        width: MENU_WIDTH,
        estimatedHeight: estimatedMenuHeight,
        gap: 6,
      }),
    );
  }, [dir, estimatedMenuHeight]);

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    updatePosition();
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const onReposition = () => updatePosition();
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) {
      setEntered(false);
      return;
    }
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, [open]);

  const pick = (action: ShelfCardMenuAction) => {
    setOpen(false);
    if (disabled) return;
    onAction(action);
  };

  const transformOrigin =
    dir === "rtl"
      ? position?.openAbove
        ? "bottom right"
        : "top right"
      : position?.openAbove
        ? "bottom left"
        : "top left";

  const menuList =
    open && !disabled && position ? (
      <ul
        ref={menuRef}
        role="menu"
        dir={dir}
        className={`fixed rounded-2xl border border-[#e7ecf5] bg-white py-1 shadow-[0_18px_54px_rgba(15,23,42,0.22)] ring-1 ring-white/70 transition-all duration-150 ease-out sm:rounded-xl ${
          entered ? "scale-100 opacity-100" : "scale-95 opacity-0"
        }`}
        style={{
          zIndex: FLOATING_MENU_Z,
          top: position.top,
          left: position.left,
          width: position.width,
          overflow: "visible",
          transformOrigin,
        }}
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
    ) : null;

  return (
    <div ref={rootRef} className="relative shrink-0 overflow-visible" dir={dir}>
      <button
        ref={btnRef}
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

      {open && typeof document !== "undefined"
        ? createPortal(
            <>
              <div
                className="fixed inset-0 z-[9998] bg-transparent"
                aria-hidden
                onClick={() => setOpen(false)}
              />
              {menuList}
            </>,
            document.body,
          )
        : null}
    </div>
  );
}
