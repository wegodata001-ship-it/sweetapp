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
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@/components/i18n-provider";

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

/**
 * ⋮ — תפריט פעולות לשורת יומן תזרים (dropdown בדסקטופ, bottom sheet במובייל).
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
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const sync = () => setIsMobile(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useLayoutEffect(() => {
    if (!open || isMobile || !btnRef.current) {
      setAnchor(null);
      return;
    }
    const rect = btnRef.current.getBoundingClientRect();
    const top = rect.bottom + 4;
    const left =
      dir === "rtl"
        ? Math.max(8, rect.right - MENU_WIDTH)
        : Math.min(window.innerWidth - MENU_WIDTH - 8, rect.left);
    setAnchor({ top, left });
  }, [open, isMobile, dir]);

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
      const t = e.target as Node;
      if (rootRef.current?.contains(t)) return;
      const portal = document.getElementById("cashflow-actions-menu-portal");
      if (portal?.contains(t)) return;
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

  const menuList = (
    <ul
      role="menu"
      dir={dir}
      className={`overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 py-1 shadow-2xl backdrop-blur-md transition-all duration-150 ease-out sm:rounded-xl sm:shadow-lg ${
        isMobile
          ? `fixed inset-x-3 bottom-3 z-[61] max-h-[min(70vh,420px)] overflow-y-auto ${
              entered ? "scale-100 opacity-100" : "scale-95 opacity-0"
            }`
          : `fixed z-[61] w-52 origin-top transition-all duration-150 ease-out ${
              entered ? "scale-100 opacity-100" : "scale-95 opacity-0"
            }`
      }`}
      style={
        !isMobile && anchor
          ? { top: anchor.top, left: anchor.left, width: MENU_WIDTH, transformOrigin: "top end" }
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
                className={`fixed inset-0 z-[60] ${isMobile ? "bg-slate-900/35 backdrop-blur-[2px]" : "bg-transparent"}`}
                aria-hidden
                onClick={() => setOpen(false)}
              />
              <div id="cashflow-actions-menu-portal">{menuList}</div>
            </>,
            document.body,
          )
        : null}
    </div>
  );
}
