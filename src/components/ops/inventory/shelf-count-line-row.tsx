"use client";

import { memo, useEffect, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle2,
  GripVertical,
  Loader2,
  Minus,
  Package,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import {
  ProductRowActionsMenu,
  type ProductRowMenuAction,
} from "./product-row-actions-menu";
import {
  countStatusLabel,
  countStatusStyles,
  resolveCountLineStatus,
} from "@/components/ops/inventory-count/count-product-status";
import type { LocationWorkerDto } from "@/components/ops/inventory-count/types";
import { selectQtyOnFocus } from "@/components/ops/inventory-count/utils";
import {
  locationMinimumStatus,
  requiredQtyToMinimum,
} from "@/lib/inventory/count-latest";
import {
  analyzeWorkerQuantities,
  sumWorkerQuantities,
} from "@/lib/inventory/count-worker-qty";

export type CountRowVariant = "table" | "card";

/** productId → workerId → qty string (מנגנון שמירה ללא שינוי) */
export type WorkerQtyMap = Record<string, string>;

export type ShelfCountLineRowProps = {
  id: string;
  name: string;
  unit: string | null;
  /** מיקום האחסון — מוצג בכרטיס המובייל בלבד */
  locationName?: string | null;
  /** ספירה אחרונה במיקום — לבסיס diff / bump */
  systemQty: number;
  /** إجمالي المخزون — סה״כ בכל המיקומים */
  systemTotalQuantity: number;
  /** الكمية المطلوبة — כמה חסר למינימום (≥0) */
  requiredQuantity: number;
  minimumQuantity: number;
  workers: LocationWorkerDto[];
  workerQtys: WorkerQtyMap;
  actualRaw: string;
  saving?: boolean;
  readOnly?: boolean;
  variant?: CountRowVariant;
  showColumnLabels?: boolean;
  /** Drag & Drop — האירועים על העטיפה במודל; כאן רק הידית */
  draggable?: boolean;
  /** הסרת השורה מהספירה — מנהל / בעל העסק בלבד */
  canRemove?: boolean;
  removing?: boolean;
  /** מובייל: האם המשתמש אישר/שינה בסבב הנוכחי (שונה מ־prefill) */
  sessionCounted?: boolean;
  /** מובייל: כרטיס בפוקוס */
  focused?: boolean;
  /** מובייל: מוצר אחרון ברשימה המסוננת — enterKeyHint=done */
  isLastInList?: boolean;
  qtyInputRef?: (el: HTMLInputElement | null) => void;
  onDragStart?: () => void;
  onWorkerQtyChange: (workerId: string, value: string) => void;
  onActualChange: (value: string) => void;
  onBump: (delta: number) => void;
  /** שמירת מינימום למוצר+מקום בלבד — לא משנה מלאי */
  onMinimumChange?: (value: number) => void;
  onQtyFocus?: () => void;
  onQtyEnterNext?: () => void;
  onEditProduct: () => void;
  onRemoveFromCount?: () => void;
  onProductMenuAction?: (action: ProductRowMenuAction) => void;
  onTransferDragStart?: () => void;
  onTransferDragEnd?: () => void;
  transferDragging?: boolean;
  t: (key: string, vars?: Record<string, string | number>) => string;
};

/** סה״כ נספר = סכום כמויות מיקומי הספירה (רק כשכל הנקודות הושלמו) */
export { analyzeWorkerQuantities, sumWorkerQuantities } from "@/lib/inventory/count-worker-qty";
export type { WorkerQtyAnalysis } from "@/lib/inventory/count-worker-qty";

/** תווית מיקום ספירה — אזור אחריות, אחרת שם */
export function countSiteLabel(w: LocationWorkerDto): string {
  const area = (w.workArea || "").trim();
  if (area) return area;
  return (w.displayName || "").trim() || "—";
}

/** Grid קבוע — עמודת مواقع الجرد דינמית בתוכה (לא עמודה לכל עובד) */
export function countTableGridTemplate(_workerCount?: number): string {
  return [
    "2rem", // drag
    "2.25rem", // icon
    "minmax(8.5rem, 12rem)", // product
    "5.5rem", // system total
    "5.5rem", // required qty
    "minmax(12rem, 1fr)", // count sites
    "5rem", // minimum
    "5rem", // diff
    "7rem", // actions
  ].join(" ");
}

function CountTableGrid({
  className,
  children,
}: {
  workers?: LocationWorkerDto[];
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`grid items-center gap-x-2 gap-y-1 ${className ?? ""}`}
      style={{ gridTemplateColumns: countTableGridTemplate() }}
    >
      {children}
    </div>
  );
}

function HeaderCell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`min-w-0 truncate px-1 text-center ${className ?? ""}`}>{children}</div>
  );
}

function MetricCell({
  value,
  className,
  valueClassName,
}: {
  value: ReactNode;
  className?: string;
  valueClassName?: string;
}) {
  return (
    <div
      className={`min-w-0 rounded-xl bg-white/90 px-1.5 py-2 text-center ring-1 ring-[#e7ecf5] ${className ?? ""}`}
    >
      <p className={`truncate text-sm font-black tabular-nums text-slate-800 ${valueClassName ?? ""}`}>
        {value}
      </p>
    </div>
  );
}

function CountSiteSquare({
  label,
  value,
  onChange,
  readOnly,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  readOnly?: boolean;
}) {
  return (
    <div className="flex w-full min-w-[4.75rem] max-w-[7.5rem] flex-col items-center sm:w-auto">
      <span
        className="mb-1 w-full truncate text-center text-[11px] font-black leading-tight text-slate-700"
        title={label}
      >
        {label}
      </span>
      <input
        type="number"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={selectQtyOnFocus}
        placeholder="—"
        min={0}
        readOnly={readOnly}
        disabled={readOnly}
        className="h-12 w-full rounded-xl border-2 border-slate-300 bg-white text-center text-lg font-black tabular-nums text-slate-900 outline-none transition focus:border-[#6c4cff] focus:ring-2 focus:ring-[#6c4cff]/20 disabled:bg-slate-50 sm:h-[3.25rem] sm:text-xl"
        aria-label={label}
      />
    </div>
  );
}

/** כפתור +/- קומפקטי למובייל — לא תופס רוחב של 2 עמודות */
function StepperButton({
  dir,
  onClick,
  label,
  compact,
}: {
  dir: "inc" | "dec";
  onClick: () => void;
  label: string;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`grid shrink-0 touch-manipulation place-items-center rounded-lg border border-[#e7ecf5] bg-white text-slate-700 transition active:scale-95 active:bg-slate-100 ${
        compact ? "h-9 w-9" : "h-11 w-11 rounded-xl"
      }`}
    >
      {dir === "inc" ? (
        <Plus className={compact ? "h-4 w-4" : "h-5 w-5"} />
      ) : (
        <Minus className={compact ? "h-4 w-4" : "h-5 w-5"} />
      )}
    </button>
  );
}

/** שורת כמות למובייל — קומפקטית; ב־dense בלי steppers רחבים כדי לא לחתוך נקודות ספירה */
function MobileQtyRow({
  label,
  value,
  onChange,
  onStep,
  readOnly,
  tone = "slate",
  enterKeyHint,
  inputRef,
  onFocus,
  onEnterNext,
  placeholder,
  dense,
  hideSteppers,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onStep: (delta: number) => void;
  readOnly?: boolean;
  tone?: "slate" | "emerald";
  enterKeyHint?: "next" | "done";
  inputRef?: (el: HTMLInputElement | null) => void;
  onFocus?: () => void;
  onEnterNext?: () => void;
  placeholder?: string;
  dense?: boolean;
  /** בלי +/- — ל־2+ נקודות ספירה ברוחב מסך */
  hideSteppers?: boolean;
}) {
  const showSteppers = !readOnly && !hideSteppers;
  const inputTone =
    tone === "emerald"
      ? "border-emerald-300 focus:border-emerald-500 focus:ring-emerald-500/25"
      : "border-slate-300 focus:border-[#6c4cff] focus:ring-[#6c4cff]/25";
  return (
    <div className="min-w-0 w-full">
      <span
        className={`mb-0.5 block truncate text-center font-black leading-tight text-slate-700 ${
          dense ? "text-[10px]" : "text-[11px]"
        }`}
      >
        {label}
      </span>
      <div className={`flex min-w-0 items-center ${dense ? "gap-0.5" : "gap-1"}`}>
        {showSteppers ? (
          <StepperButton
            dir="dec"
            compact={dense}
            onClick={() => onStep(-1)}
            label={`${label} -1`}
          />
        ) : null}
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={value}
          onChange={(e) => {
            const next = e.target.value.replace(/[^\d.]/g, "");
            onChange(next);
          }}
          onFocus={(e) => {
            selectQtyOnFocus(e);
            onFocus?.();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onEnterNext?.();
            }
          }}
          placeholder={placeholder ?? "—"}
          min={0}
          readOnly={readOnly}
          disabled={readOnly}
          enterKeyHint={enterKeyHint}
          aria-label={label}
          className={`h-10 min-w-0 flex-1 touch-manipulation rounded-lg border-2 bg-white text-center font-black leading-none tabular-nums text-slate-900 outline-none transition focus:ring-2 disabled:bg-slate-50 ${
            dense ? "text-base" : "text-lg"
          } ${inputTone}`}
        />
        {showSteppers ? (
          <StepperButton
            dir="inc"
            compact={dense}
            onClick={() => onStep(1)}
            label={`${label} +1`}
          />
        ) : null}
      </div>
    </div>
  );
}

function CountSitesPanel({
  workers,
  workerQtys,
  onWorkerQtyChange,
  countedTotalLabel,
  countedSumLabel,
  readOnly,
}: {
  workers: LocationWorkerDto[];
  workerQtys: WorkerQtyMap;
  onWorkerQtyChange: (workerId: string, value: string) => void;
  countedTotalLabel: string;
  countedSumLabel: string;
  readOnly?: boolean;
}) {
  if (workers.length === 0) return null;
  return (
    <div className="min-w-0 rounded-xl bg-slate-50/90 px-2 py-2 ring-1 ring-[#e7ecf5]">
      <div className="flex flex-wrap items-end justify-center gap-2 sm:gap-3">
        {workers.map((w) => (
          <CountSiteSquare
            key={w.id}
            label={countSiteLabel(w)}
            value={workerQtys[w.id] ?? ""}
            onChange={(v) => onWorkerQtyChange(w.id, v)}
            readOnly={readOnly}
          />
        ))}
      </div>
      <p className="mt-2 text-center text-[11px] font-black text-emerald-800">
        {countedSumLabel}:{" "}
        <span className="tabular-nums text-base">{countedTotalLabel}</span>
      </p>
    </div>
  );
}

/** כותרת עמודות — מבנה הלקוח */
export function ShelfCountTableHeader({
  workers,
  t,
}: {
  workers: LocationWorkerDto[];
  t: (key: string) => string;
}) {
  return (
    <CountTableGrid
      workers={workers}
      className="rounded-2xl border border-[#e7ecf5] bg-[#f1f5f9] px-2.5 py-2.5 text-[10px] font-black text-slate-600 sm:px-3 sm:text-[11px]"
    >
      <div aria-hidden />
      <div aria-hidden />
      <HeaderCell className="text-end">{t("productCol")}</HeaderCell>
      <HeaderCell>{t("systemTotal")}</HeaderCell>
      <HeaderCell>{t("locationExpected")}</HeaderCell>
      <HeaderCell className="text-[#6c4cff]">{t("countSites")}</HeaderCell>
      <HeaderCell>{t("minimum")}</HeaderCell>
      <HeaderCell>{t("diff")}</HeaderCell>
      <HeaderCell>{t("actionsCol")}</HeaderCell>
    </CountTableGrid>
  );
}

function useCountDerived(
  countedTotal: number | null,
  systemQty: number,
  systemTotalQuantity: number,
  minimumQuantity: number,
) {
  const actual = countedTotal;
  const diff =
    actual === null || Number.isNaN(actual) ? null : actual - systemQty;
  const status = resolveCountLineStatus(
    actual === null || Number.isNaN(actual) ? null : actual,
    systemQty,
  );
  const st = countStatusStyles(status);
  /** מינימום מול הכמות שנספרה; אם אין ספירה — מול מלאי המיקום */
  const onHandForMin =
    actual !== null && !Number.isNaN(actual) ? actual : systemTotalQuantity;
  const minEval = locationMinimumStatus(onHandForMin, minimumQuantity);
  const minimumStatus = minEval.status === "below" ? "below" : "ok";
  const shortageToMin = minEval.shortage;
  const requiredNow = requiredQtyToMinimum(onHandForMin, minimumQuantity);
  const minimumClasses =
    minimumStatus === "below"
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : "border-emerald-200 bg-emerald-50 text-emerald-700";
  const diffLabel =
    diff === null ? "—" : diff === 0 ? "0" : diff > 0 ? `+${diff}` : String(diff);
  const diffTone =
    diff === null
      ? "text-slate-400"
      : diff < 0
        ? "text-rose-600"
        : diff > 0
          ? "text-amber-600"
          : "text-emerald-600";
  const diffBox =
    diff === null
      ? "ring-[#e7ecf5] bg-white/90"
      : diff < 0
        ? "ring-rose-200 bg-rose-50"
        : diff > 0
          ? "ring-amber-200 bg-amber-50"
          : "ring-emerald-200 bg-emerald-50";
  const totalLabel =
    actual === null || Number.isNaN(actual) ? "—" : String(actual);
  return {
    actual,
    diff,
    status,
    st,
    minimumStatus,
    shortageToMin,
    requiredNow,
    minimumClasses,
    diffLabel,
    diffTone,
    diffBox,
    totalLabel,
  };
}

function MinimumQtyInput({
  value,
  onCommit,
  readOnly,
  className,
}: {
  value: number;
  onCommit?: (n: number) => void;
  readOnly?: boolean;
  className?: string;
}) {
  const [raw, setRaw] = useState(String(value));
  useEffect(() => {
    setRaw(String(value));
  }, [value]);

  const commit = () => {
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) {
      setRaw(String(value));
      return;
    }
    const next = Math.max(0, n);
    setRaw(String(next));
    if (next !== value) onCommit?.(next);
  };

  return (
    <input
      type="number"
      inputMode="decimal"
      min={0}
      value={raw}
      readOnly={readOnly || !onCommit}
      disabled={readOnly || !onCommit}
      onChange={(e) => setRaw(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          (e.target as HTMLInputElement).blur();
        }
      }}
      onFocus={selectQtyOnFocus}
      className={className}
      aria-label="minimum"
    />
  );
}

function WorkerQtyInput({
  value,
  onChange,
  className,
  readOnly,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  readOnly?: boolean;
}) {
  return (
    <input
      type="number"
      inputMode="decimal"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onFocus={selectQtyOnFocus}
      className={className}
      placeholder="—"
      min={0}
      readOnly={readOnly}
      disabled={readOnly}
    />
  );
}

function DragHandle({
  draggable,
  onDragStart,
}: {
  draggable?: boolean;
  onDragStart?: () => void;
}) {
  if (!draggable) {
    return <div aria-hidden className="h-8 w-8" />;
  }
  return (
    <button
      type="button"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("application/x-count-reorder", "1");
        onDragStart?.();
      }}
      className="grid h-8 w-8 cursor-grab place-items-center justify-self-center rounded-lg text-slate-400 active:cursor-grabbing hover:bg-white hover:text-slate-600"
      aria-label="Reorder"
      title="Reorder"
    >
      <GripVertical className="h-4 w-4" aria-hidden />
    </button>
  );
}

function TransferDragHandle({
  disabled,
  dragging,
  onDragStart,
  onDragEnd,
  label,
}: {
  disabled?: boolean;
  dragging?: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  label: string;
}) {
  if (disabled) return null;
  return (
    <button
      type="button"
      draggable
      onDragStart={(e) => {
        e.stopPropagation();
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("application/x-product-transfer", "1");
        onDragStart?.();
      }}
      onDragEnd={(e) => {
        e.stopPropagation();
        onDragEnd?.();
      }}
      className={`grid h-8 w-8 shrink-0 cursor-grab touch-manipulation place-items-center rounded-lg text-[#6c4cff] active:cursor-grabbing hover:bg-violet-50 ${
        dragging ? "bg-violet-100 ring-2 ring-[#6c4cff]/40" : ""
      }`}
      aria-label={label}
      title={label}
    >
      <ArrowRightLeft className="h-4 w-4" aria-hidden />
    </button>
  );
}

/** הסרת המוצר מהספירה הנוכחית — המוצר עצמו נשאר במערכת */
function RemoveRowButton({
  size,
  removing,
  onClick,
  label,
}: {
  size: "sm" | "lg";
  removing?: boolean;
  onClick: () => void;
  label: string;
}) {
  const box =
    size === "lg"
      ? "h-10 w-10 shrink-0 touch-manipulation rounded-xl border border-rose-100 bg-white"
      : "mt-0.5 h-7 w-7 shrink-0 rounded-lg";
  const icon = size === "lg" ? "h-4 w-4" : "h-3.5 w-3.5";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={removing}
      className={`grid place-items-center text-rose-500 transition hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50 ${box}`}
      aria-label={label}
      title={label}
    >
      {removing ? (
        <Loader2 className={`${icon} animate-spin`} aria-hidden />
      ) : (
        <Trash2 className={icon} aria-hidden />
      )}
    </button>
  );
}

function ShelfCountLineRowInner({
  name,
  unit,
  locationName: _locationName,
  systemQty,
  systemTotalQuantity,
  requiredQuantity,
  minimumQuantity,
  workers,
  workerQtys,
  actualRaw,
  saving,
  readOnly = false,
  variant = "table",
  draggable = false,
  canRemove = false,
  removing = false,
  sessionCounted = false,
  focused = false,
  isLastInList = false,
  qtyInputRef,
  onDragStart,
  onWorkerQtyChange,
  onActualChange,
  onBump,
  onMinimumChange,
  onQtyFocus,
  onQtyEnterNext,
  onEditProduct,
  onRemoveFromCount,
  onProductMenuAction,
  onTransferDragStart,
  onTransferDragEnd,
  transferDragging = false,
  t,
}: ShelfCountLineRowProps) {
  const showRemove = !readOnly && canRemove && !!onRemoveFromCount;
  const showMenu = !readOnly && !!onProductMenuAction;
  const hasWorkers = workers.length > 0;
  const workerAnalysis = hasWorkers ? analyzeWorkerQuantities(workers, workerQtys) : null;
  const workerSum = workerAnalysis?.total ?? null;
  const countedTotal = hasWorkers
    ? workerSum
    : actualRaw === ""
      ? null
      : Number(actualRaw);

  const {
    status,
    st,
    minimumStatus,
    shortageToMin,
    requiredNow,
    minimumClasses,
    diffLabel,
    diffTone,
    diffBox,
    totalLabel,
  } = useCountDerived(countedTotal, systemQty, systemTotalQuantity, minimumQuantity);
  const requiredDisplay = requiredNow > 0 ? requiredNow : requiredQuantity;
  const qtyPlaceholder = t("qtyPlaceholder");
  const sessionTotalIncomplete =
    hasWorkers && workerAnalysis != null && !workerAnalysis.complete;
  const sessionTotalLabel = !hasWorkers
    ? countedTotal === null || Number.isNaN(countedTotal)
      ? "—"
      : String(countedTotal)
    : workerAnalysis?.complete
      ? String(workerAnalysis.total)
      : sessionTotalIncomplete
        ? t("partialCountTotal", {
            sum: workerAnalysis!.partialSum,
            n: workerAnalysis!.unsetCount,
          })
        : "—";

  if (variant === "card") {
    const cardRing = focused
      ? "border-[#6c4cff] bg-[#f5f3ff] shadow-sm ring-2 ring-[#6c4cff]/30"
      : sessionCounted
        ? "border-[#e7ecf5] bg-white"
        : "border-dashed border-slate-200 bg-slate-50/60";
    const belowMin = sessionCounted && shortageToMin > 0;
    const minFieldLabel = t("minimumToday");
    const shortageLabel = t("shortageToday");
    /** 2+ נקודות — בלי steppers בצד כדי שלא ייחתכו ב־375px */
    const multiSites = hasWorkers && workers.length >= 2;

    return (
      <div
        data-count-card
        className={`rounded-lg border px-2 py-1.5 transition-shadow ${
          belowMin ? "border-rose-300 bg-rose-50/40" : ""
        } ${cardRing}`}
      >
        {/* Header: מחיקה | שם + מלאי במקום (SSOT) */}
        <div className="flex items-start gap-1">
          {showMenu ? (
            <ProductRowActionsMenu
              canRemove={showRemove}
              removing={removing}
              disabled={readOnly}
              t={t}
              onAction={(action) => {
                if (action === "edit") onEditProduct();
                else if (action === "remove") onRemoveFromCount?.();
                else onProductMenuAction?.(action);
              }}
            />
          ) : showRemove ? (
            <RemoveRowButton
              size="lg"
              removing={removing}
              onClick={() => onRemoveFromCount?.()}
              label={t("removeRow")}
            />
          ) : null}
          <TransferDragHandle
            disabled={readOnly}
            dragging={transferDragging}
            label={t("moveToLocation")}
            onDragStart={onTransferDragStart}
            onDragEnd={onTransferDragEnd}
          />
          <div className="min-w-0 flex-1 text-end">
            <p className="line-clamp-2 text-sm font-black leading-snug text-slate-900">{name}</p>
            {unit ? (
              <p className="truncate text-[10px] font-semibold text-slate-500">{unit}</p>
            ) : null}
            <p className="mt-0.5 text-[11px] font-bold tabular-nums text-slate-600">
              {t("systemTotal")}:{" "}
              <span className="font-black text-slate-800">{systemTotalQuantity}</span>
            </p>
            <p className="text-[11px] font-bold tabular-nums text-slate-600">
              {minFieldLabel}:{" "}
              <span className="font-black text-slate-800">{minimumQuantity}</span>
            </p>
            {countedTotal !== null && !Number.isNaN(countedTotal) ? (
              <p className="text-[11px] font-bold tabular-nums text-slate-600">
                {shortageLabel}:{" "}
                <span
                  className={`font-black ${shortageToMin > 0 ? "text-rose-700" : "text-slate-800"}`}
                >
                  {shortageToMin}
                </span>
              </p>
            ) : null}
          </div>
        </div>

        {/* כל נקודות הספירה מההגדרה הנוכחית — בלי slice / בלי הסתרה */}
        {hasWorkers ? (
          <div
            className={`mt-1.5 grid gap-1.5 ${
              multiSites
                ? "grid-cols-1 min-[360px]:grid-cols-2"
                : "grid-cols-1"
            }`}
          >
            {workers.map((w, idx) => {
              const raw = workerQtys[w.id] ?? "";
              const isLastWorker = idx === workers.length - 1;
              return (
                <MobileQtyRow
                  key={w.id}
                  label={countSiteLabel(w)}
                  value={raw}
                  readOnly={readOnly}
                  dense={multiSites}
                  hideSteppers={multiSites}
                  enterKeyHint={isLastWorker ? (isLastInList ? "done" : "next") : "next"}
                  placeholder={qtyPlaceholder}
                  inputRef={idx === 0 ? qtyInputRef : undefined}
                  onFocus={onQtyFocus}
                  onEnterNext={() => {
                    if (!isLastWorker) {
                      const root = (document.activeElement as HTMLElement | null)?.closest(
                        "[data-count-card]",
                      );
                      const inputs = root?.querySelectorAll<HTMLInputElement>(
                        "input[inputmode='numeric']",
                      );
                      const nextInput = inputs?.[idx + 1];
                      if (nextInput) {
                        nextInput.focus();
                        nextInput.select();
                        return;
                      }
                    }
                    onQtyEnterNext?.();
                  }}
                  onChange={(v) => onWorkerQtyChange(w.id, v)}
                  onStep={(delta) => {
                    const base = raw === "" ? 0 : Number(raw);
                    const next = Math.max(0, (Number.isNaN(base) ? 0 : base) + delta);
                    onWorkerQtyChange(w.id, String(next));
                  }}
                />
              );
            })}
          </div>
        ) : (
          <div className="mt-1.5">
            <MobileQtyRow
              label={t("countedQtyLabel")}
              value={actualRaw}
              readOnly={readOnly}
              tone="emerald"
              dense
              enterKeyHint={isLastInList ? "done" : "next"}
              placeholder={qtyPlaceholder}
              inputRef={qtyInputRef}
              onFocus={onQtyFocus}
              onEnterNext={onQtyEnterNext}
              onChange={onActualChange}
              onStep={onBump}
            />
          </div>
        )}

        {/* סה״כ ספירה (חי) | חסר להיום */}
        <div className="mt-1.5 grid grid-cols-2 gap-1.5">
          <div className="min-w-0 rounded-lg bg-emerald-50 px-1.5 py-1 text-center ring-1 ring-emerald-200">
            <span className="block text-[10px] font-black leading-tight text-emerald-800">
              {t("countSessionTotal")}
            </span>
            <p className="text-lg font-black tabular-nums leading-tight text-slate-900">
              {sessionTotalLabel}
            </p>
          </div>
          <div
            className={`min-w-0 rounded-lg px-1.5 py-1 text-center ring-1 ${
              shortageToMin > 0 ? "bg-rose-50 ring-rose-200" : "bg-slate-50 ring-slate-200"
            }`}
          >
            <span
              className={`block text-[10px] font-black leading-tight ${
                shortageToMin > 0 ? "text-rose-800" : "text-slate-600"
              }`}
            >
              {shortageLabel}
            </span>
            <p
              className={`text-lg font-black tabular-nums leading-tight ${
                shortageToMin > 0 ? "text-rose-800" : "text-slate-900"
              }`}
            >
              {countedTotal === null || Number.isNaN(countedTotal) ? "—" : shortageToMin}
            </p>
          </div>
        </div>

        <div className="mt-1 flex flex-wrap items-center justify-center gap-1">
          {!sessionCounted ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-600 ring-1 ring-slate-200">
              <span className="h-1.5 w-1.5 rounded-full bg-slate-400" aria-hidden />
              {t("sessionUncounted")}
            </span>
          ) : belowMin ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-black text-rose-700 ring-1 ring-rose-200">
              <AlertTriangle className="h-3 w-3" aria-hidden />
              {t("minimumBelowWithShortage", { n: shortageToMin })}
            </span>
          ) : countedTotal !== null && !Number.isNaN(countedTotal) && countedTotal === 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-700 ring-1 ring-slate-200">
              <CheckCircle2 className="h-3 w-3" aria-hidden />
              {t("sessionCountedZero")}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-black text-emerald-700 ring-1 ring-emerald-200">
              <CheckCircle2 className="h-3 w-3" aria-hidden />
              {t("minimumOk")}
            </span>
          )}
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-[#6c4cff]" aria-hidden />
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <CountTableGrid
      workers={workers}
      className={`rounded-2xl border px-2.5 py-2.5 text-[10px] font-bold transition-shadow duration-200 sm:px-3 ${st.row}`}
    >
      <DragHandle draggable={draggable && !readOnly} onDragStart={onDragStart} />

      <div className="grid h-9 w-9 place-items-center justify-self-center rounded-xl bg-white text-[#6c4cff] shadow-sm ring-1 ring-[#e7ecf5]">
        <Package className="h-4 w-4" strokeWidth={1.5} aria-hidden />
      </div>

      <div className="min-w-0 text-end">
        <div className="flex items-start justify-end gap-1">
          {showMenu ? (
            <ProductRowActionsMenu
              canRemove={showRemove}
              removing={removing}
              disabled={readOnly}
              t={t}
              onAction={(action) => {
                if (action === "edit") onEditProduct();
                else if (action === "remove") onRemoveFromCount?.();
                else onProductMenuAction?.(action);
              }}
            />
          ) : null}
          {!readOnly && !showMenu ? (
            <button
              type="button"
              onClick={onEditProduct}
              className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg text-slate-500 hover:bg-white"
              aria-label={t("editProduct")}
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          ) : null}
          <TransferDragHandle
            disabled={readOnly}
            dragging={transferDragging}
            label={t("moveToLocation")}
            onDragStart={onTransferDragStart}
            onDragEnd={onTransferDragEnd}
          />
          <div className="min-w-0">
            <p className="line-clamp-2 break-words text-sm font-black leading-tight text-slate-900 sm:text-[13px]">
              {name}
            </p>
            {unit ? (
              <p className="truncate text-[10px] font-semibold text-slate-500">{unit}</p>
            ) : null}
          </div>
        </div>
      </div>

      <MetricCell value={systemTotalQuantity} />
      <MetricCell value={requiredDisplay} />

      {hasWorkers ? (
        <CountSitesPanel
          workers={workers}
          workerQtys={workerQtys}
          onWorkerQtyChange={onWorkerQtyChange}
          countedTotalLabel={totalLabel}
          countedSumLabel={t("countedTotal")}
          readOnly={readOnly}
        />
      ) : (
        <div className="min-w-0 rounded-xl bg-emerald-50/90 px-2 py-2 text-center ring-1 ring-emerald-200">
          <span className="mb-1 block text-[10px] font-bold text-emerald-800">
            {t("countedTotal")}
          </span>
          <WorkerQtyInput
            value={actualRaw}
            onChange={onActualChange}
            readOnly={readOnly}
            className="h-12 w-full rounded-xl border-2 border-emerald-200 bg-white text-center text-xl font-black tabular-nums text-slate-900 outline-none"
          />
        </div>
      )}

      <div className={`min-w-0 rounded-xl border px-1 py-1.5 text-center ${minimumClasses}`}>
        {onMinimumChange && !readOnly ? (
          <MinimumQtyInput
            value={minimumQuantity}
            onCommit={onMinimumChange}
            readOnly={readOnly}
            className="h-10 w-full border-0 bg-transparent text-center text-sm font-black tabular-nums text-inherit outline-none"
          />
        ) : (
          <>
            <span className="block text-[10px] font-bold opacity-80">{t("minimumToday")}</span>
            <p className="text-sm font-black tabular-nums">{minimumQuantity}</p>
          </>
        )}
      </div>

      <div className={`min-w-0 rounded-xl px-1.5 py-2 text-center ring-1 ${diffBox}`}>
        <p className={`text-sm font-black tabular-nums ${diffTone}`}>{diffLabel}</p>
      </div>

      <div className="flex min-w-0 flex-wrap items-center justify-center gap-1">
        {!readOnly ? (
          <>
            <button
              type="button"
              onClick={() => onBump(-1)}
              className="grid h-9 w-9 place-items-center rounded-xl border border-[#e7ecf5] bg-white text-slate-700 hover:bg-[#f6f8fc] active:scale-95"
              aria-label="-1"
            >
              <Minus className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => onBump(1)}
              className="grid h-9 w-9 place-items-center rounded-xl border border-[#e7ecf5] bg-white text-slate-700 hover:bg-[#f6f8fc] active:scale-95"
              aria-label="+1"
            >
              <Plus className="h-4 w-4" />
            </button>
          </>
        ) : null}
        {shortageToMin > 0 ? (
          minimumStatus === "below" ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-black text-rose-700 ring-1 ring-rose-200">
              <AlertTriangle className="h-3 w-3" aria-hidden />
              {t("minimumBelowWithShortage", { n: shortageToMin })}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-black text-emerald-700 ring-1 ring-emerald-200">
              <CheckCircle2 className="h-3 w-3" aria-hidden />
              {t("minimumOk")}
            </span>
          )
        ) : null}
        <span className="inline-flex items-center gap-1 rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-black text-slate-700 ring-1 ring-[#e7ecf5]">
          {saving ? (
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
          ) : (
            <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />
          )}
          {countStatusLabel(status, t)}
        </span>
      </div>
    </CountTableGrid>
  );
}

export const ShelfCountLineRow = memo(ShelfCountLineRowInner);
