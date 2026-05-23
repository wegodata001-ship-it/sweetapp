"use client";

import {
  Banknote,
  Copy,
  Eye,
  FileText,
  Loader2,
  MoreVertical,
  Pencil,
  Printer,
  Receipt,
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

export type CashflowMenuAction =
  | "view"
  | "edit"
  | "pdf"
  | "print"
  | "delete"
  | "duplicate"
  | "addPayment"
  | "generateDocument";

type MenuItem = {
  id: CashflowMenuAction;
  icon: typeof Eye;
  labelKey: string;
  danger?: boolean;
  disabled?: boolean;
};

type Props = {
  onAction: (action: CashflowMenuAction) => void;
  busy?: boolean;
  pdfBusy?: boolean;
  canView?: boolean;
  canAddPayment?: boolean;
  canGenerateDocument?: boolean;
  /** דוח Z — תפריט מצומצם */
  variant?: "default" | "zReport";
};

const MENU_WIDTH = 208;
const MENU_ITEM_HEIGHT = 40;
const MENU_PADDING = 8;

/**
 * ⋮ — תפריט פעולות לשורת יומן תזרים (portal + fixed, flip למעלה בשורות תחתונות).
 */
export function CashflowRowActionsMenu({
  onAction,
  busy,
  pdfBusy,
  canView = true,
  canAddPayment = true,
  canGenerateDocument = true,
  variant = "default",
}: Props) {
  const { t, dir } = useI18n();
  const [open, setOpen] = useState(false);
  const [entered, setEntered] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [position, setPosition] = useState<DropdownMenuPosition | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);

  const items: MenuItem[] =
    variant === "zReport"
      ? [
          { id: "pdf", icon: FileText, labelKey: "cashflow.menuPdf", disabled: pdfBusy },
          { id: "print", icon: Printer, labelKey: "cashflow.menuPrint", disabled: pdfBusy },
          { id: "edit", icon: Pencil, labelKey: "cashflow.menuEdit" },
          { id: "delete", icon: Trash2, labelKey: "cashflow.menuDelete", danger: true },
        ]
      : [
          { id: "view", icon: Eye, labelKey: "cashflow.menuView", disabled: !canView },
          { id: "edit", icon: Pencil, labelKey: "cashflow.menuEdit" },
          { id: "pdf", icon: FileText, labelKey: "cashflow.menuPdf", disabled: pdfBusy },
          { id: "duplicate", icon: Copy, labelKey: "cashflow.menuDuplicate" },
          { id: "addPayment", icon: Banknote, labelKey: "cashflow.menuAddPayment", disabled: !canAddPayment },
          { id: "generateDocument", icon: Receipt, labelKey: "cashflow.menuGenerateDoc", disabled: !canGenerateDocument },
          { id: "delete", icon: Trash2, labelKey: "cashflow.menuDelete", danger: true },
        ];

  const estimatedMenuHeight = items.length * MENU_ITEM_HEIGHT + MENU_PADDING;

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const sync = () => setIsMobile(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const updatePosition = useCallback(() => {
    const el = btnRef.current;
    if (!el) return;
    setPosition(
      computeDropdownMenuPosition(el, dir, {
        width: MENU_WIDTH,
        estimatedHeight: estimatedMenuHeight,
      }),
    );
  }, [dir, estimatedMenuHeight]);

  useLayoutEffect(() => {
    if (!open || isMobile) {
      setPosition(null);
      return;
    }
    updatePosition();
  }, [open, isMobile, updatePosition]);

  useEffect(() => {
    if (!open || isMobile) return;
    const onReposition = () => updatePosition();
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open, isMobile, updatePosition]);

  useEffect(() => {
    if (!open) {
      setEntered(false);
      return;
    }
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, [open]);

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

  const pick = (action: CashflowMenuAction) => {
    setOpen(false);
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

  const menuList = (
    <ul
      ref={menuRef}
      role="menu"
      dir={dir}
      className={`overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 py-1 shadow-2xl backdrop-blur-md transition-all duration-150 ease-out sm:rounded-xl sm:shadow-[0_16px_48px_rgba(15,23,42,0.18)] ${
        isMobile
          ? `fixed inset-x-3 bottom-3 max-h-[min(70vh,420px)] overflow-y-auto ${
              entered ? "scale-100 opacity-100" : "scale-95 opacity-0"
            }`
          : `fixed w-52 transition-all duration-150 ease-out ${
              entered ? "scale-100 opacity-100" : "scale-95 opacity-0"
            }`
      }`}
      style={
        !isMobile && position
          ? {
              zIndex: FLOATING_MENU_Z,
              top: position.top,
              left: position.left,
              width: position.width,
              transformOrigin,
            }
          : isMobile
            ? { zIndex: FLOATING_MENU_Z }
            : undefined
      }
    >
      {items.map(({ id, icon: Icon, labelKey, danger, disabled }) => (
        <li key={id} role="none">
          <button
            type="button"
            role="menuitem"
            disabled={disabled || busy}
            onClick={(e) => {
              e.stopPropagation();
              if (!disabled) pick(id);
            }}
            className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-start text-sm font-semibold transition sm:py-2 sm:text-[13px] ${
              danger
                ? "text-rose-700 hover:bg-rose-50 disabled:opacity-40"
                : "text-slate-800 hover:bg-slate-50/90 disabled:opacity-40"
            }`}
          >
            {id === "pdf" && pdfBusy ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-sky-600" aria-hidden />
            ) : (
              <Icon className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
            )}
            {t(labelKey)}
          </button>
        </li>
      ))}
    </ul>
  );

  return (
    <div ref={rootRef} className="relative inline-flex shrink-0 justify-center" dir={dir}>
      <button
        ref={btnRef}
        type="button"
        disabled={busy}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200/90 bg-white text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-40"
        aria-label={t("cashflow.menuLabel")}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <MoreVertical className="h-4 w-4" aria-hidden />
      </button>

      {open && typeof document !== "undefined"
        ? createPortal(
            <>
              <div
                className={`fixed inset-0 ${isMobile ? "z-[9998] bg-slate-900/35 backdrop-blur-[2px]" : "z-[9998] bg-transparent"}`}
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
