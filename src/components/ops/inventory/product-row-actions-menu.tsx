"use client";

import {
  ArrowRightLeft,
  MoreVertical,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@/components/i18n-provider";
import {
  computeDropdownMenuPosition,
  FLOATING_MENU_Z,
  type DropdownMenuPosition,
} from "@/lib/ui/floating-menu-position";

export type ProductRowMenuAction = "edit" | "move" | "addAlso" | "remove";

type Props = {
  onAction: (action: ProductRowMenuAction) => void;
  canRemove?: boolean;
  removing?: boolean;
  disabled?: boolean;
  t: (key: string) => string;
};

const MENU_WIDTH = 240;
const MENU_ITEM_HEIGHT = 44;

export function ProductRowActionsMenu({
  onAction,
  canRemove = false,
  removing,
  disabled,
  t,
}: Props) {
  const { dir } = useI18n();
  const [open, setOpen] = useState(false);
  const [entered, setEntered] = useState(false);
  const [position, setPosition] = useState<DropdownMenuPosition | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);

  const items: {
    id: ProductRowMenuAction;
    icon: typeof Pencil;
    label: string;
    className: string;
    hidden?: boolean;
  }[] = [
    {
      id: "edit" as const,
      icon: Pencil,
      label: t("editProduct"),
      className: "text-slate-800 hover:bg-slate-50",
    },
    {
      id: "move" as const,
      icon: ArrowRightLeft,
      label: t("moveToLocation"),
      className: "text-[#6c4cff] hover:bg-violet-50",
    },
    {
      id: "addAlso" as const,
      icon: Plus,
      label: t("addToLocation"),
      className: "text-emerald-700 hover:bg-emerald-50",
    },
    {
      id: "remove" as const,
      icon: Trash2,
      label: t("removeRow"),
      className: "text-rose-700 hover:bg-rose-50",
      hidden: !canRemove,
    },
  ].filter((i) => !i.hidden);

  const estimatedMenuHeight = MENU_ITEM_HEIGHT * items.length + 8;

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
    if (!open) {
      setEntered(false);
      return;
    }
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, [open]);

  const pick = (action: ProductRowMenuAction) => {
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
        className={`fixed rounded-2xl border border-[#e7ecf5] bg-white py-1 shadow-[0_18px_54px_rgba(15,23,42,0.22)] transition-all duration-150 ease-out ${
          entered ? "scale-100 opacity-100" : "scale-95 opacity-0"
        }`}
        style={{
          zIndex: FLOATING_MENU_Z,
          top: position.top,
          left: position.left,
          width: position.width,
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
              disabled={id === "remove" && removing}
              className={`flex w-full min-h-11 items-center gap-2.5 px-3.5 py-2.5 text-start text-sm font-bold transition sm:min-h-0 sm:py-2 sm:text-xs ${className}`}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden />
              {label}
            </button>
          </li>
        ))}
      </ul>
    ) : null;

  return (
    <div ref={rootRef} className="relative shrink-0 overflow-visible">
      <button
        ref={btnRef}
        type="button"
        disabled={disabled || removing}
        onClick={(e) => {
          e.stopPropagation();
          if (disabled) return;
          setOpen((v) => !v);
        }}
        className="grid h-8 w-8 touch-manipulation place-items-center rounded-xl text-slate-500 ring-1 ring-slate-200/80 hover:bg-white hover:text-slate-800 disabled:opacity-50"
        aria-label={t("productMenu")}
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
