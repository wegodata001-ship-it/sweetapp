"use client";

import { memo, type ReactNode } from "react";
import {
  AlertTriangle,
  Loader2,
  Minus,
  Package,
  Pencil,
  Plus,
} from "lucide-react";
import {
  countStatusLabel,
  countStatusStyles,
  resolveCountLineStatus,
} from "@/components/ops/inventory-count/count-product-status";
import type { LocationWorkerDto } from "@/components/ops/inventory-count/types";

export type CountRowVariant = "table" | "card";

/** productId → workerId → qty string (מנגנון שמירה ללא שינוי) */
export type WorkerQtyMap = Record<string, string>;

export type ShelfCountLineRowProps = {
  id: string;
  name: string;
  barcode: string | null;
  sku: string | null;
  unit: string | null;
  systemQty: number;
  systemTotalQuantity: number;
  systemShortage: number;
  minimumQuantity: number;
  workers: LocationWorkerDto[];
  workerQtys: WorkerQtyMap;
  actualRaw: string;
  saving?: boolean;
  readOnly?: boolean;
  variant?: CountRowVariant;
  showColumnLabels?: boolean;
  onWorkerQtyChange: (workerId: string, value: string) => void;
  onActualChange: (value: string) => void;
  onBump: (delta: number) => void;
  onEditProduct: () => void;
  t: (key: string) => string;
};

/** סה״כ נספר = סכום כמויות מיקומי הספירה (workers) — ללא שינוי לוגיקה */
export function sumWorkerQuantities(
  workers: LocationWorkerDto[],
  workerQtys: WorkerQtyMap,
): number | null {
  if (workers.length === 0) return null;
  let any = false;
  let sum = 0;
  for (const w of workers) {
    const raw = workerQtys[w.id] ?? "";
    if (raw === "") continue;
    any = true;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) return Number.NaN;
    sum += n;
  }
  if (!any) return null;
  return sum;
}

/** תווית מיקום ספירה — אזור אחריות, אחרת שם */
export function countSiteLabel(w: LocationWorkerDto): string {
  const area = (w.workArea || "").trim();
  if (area) return area;
  return (w.displayName || "").trim() || "—";
}

/** Grid קבוע — עמודת مواقع الجرد דינמית בתוכה (לא עמודה לכל עובד) */
export function countTableGridTemplate(_workerCount?: number): string {
  return [
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

function StatBlock({
  label,
  value,
  valueClassName,
  className,
}: {
  label: string;
  value: ReactNode;
  valueClassName?: string;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl bg-white/90 px-2 py-2 text-center ring-1 ring-[#e7ecf5] ${className ?? ""}`}
    >
      <span className="block text-[10px] font-bold text-slate-500">{label}</span>
      <div className={`mt-0.5 text-sm font-black tabular-nums text-slate-800 ${valueClassName ?? ""}`}>
        {value}
      </div>
    </div>
  );
}

function CountSiteSquare({
  label,
  value,
  onChange,
  readOnly,
  large,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  readOnly?: boolean;
  large?: boolean;
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
        placeholder="—"
        min={0}
        readOnly={readOnly}
        disabled={readOnly}
        className={`w-full rounded-xl border-2 border-slate-300 bg-white text-center font-black tabular-nums text-slate-900 outline-none transition focus:border-[#6c4cff] focus:ring-2 focus:ring-[#6c4cff]/20 disabled:bg-slate-50 ${
          large
            ? "h-14 text-2xl sm:h-16 sm:text-3xl"
            : "h-12 text-lg sm:h-[3.25rem] sm:text-xl"
        }`}
        aria-label={label}
      />
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
  stacked,
}: {
  workers: LocationWorkerDto[];
  workerQtys: WorkerQtyMap;
  onWorkerQtyChange: (workerId: string, value: string) => void;
  countedTotalLabel: string;
  countedSumLabel: string;
  readOnly?: boolean;
  stacked?: boolean;
}) {
  if (workers.length === 0) return null;
  return (
    <div className="min-w-0 rounded-xl bg-slate-50/90 px-2 py-2 ring-1 ring-[#e7ecf5]">
      <div
        className={
          stacked
            ? "flex flex-col items-stretch gap-3"
            : "flex flex-wrap items-end justify-center gap-2 sm:gap-3"
        }
      >
        {workers.map((w) => (
          <CountSiteSquare
            key={w.id}
            label={countSiteLabel(w)}
            value={workerQtys[w.id] ?? ""}
            onChange={(v) => onWorkerQtyChange(w.id, v)}
            readOnly={readOnly}
            large={stacked}
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
  const minimumStatus =
    minimumQuantity <= 0
      ? "ok"
      : systemTotalQuantity < minimumQuantity
        ? "below"
        : systemTotalQuantity <= minimumQuantity * 1.2
          ? "near"
          : "ok";
  const minimumClasses =
    minimumStatus === "below"
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : minimumStatus === "near"
        ? "border-amber-200 bg-amber-50 text-amber-700"
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
    minimumClasses,
    diffLabel,
    diffTone,
    diffBox,
    totalLabel,
  };
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
      className={className}
      placeholder="—"
      min={0}
      readOnly={readOnly}
      disabled={readOnly}
    />
  );
}

function ShelfCountLineRowInner({
  name,
  barcode,
  sku,
  unit,
  systemQty,
  systemTotalQuantity,
  minimumQuantity,
  workers,
  workerQtys,
  actualRaw,
  saving,
  readOnly = false,
  variant = "table",
  onWorkerQtyChange,
  onActualChange,
  onBump,
  onEditProduct,
  t,
}: ShelfCountLineRowProps) {
  const hasWorkers = workers.length > 0;
  const workerSum = hasWorkers ? sumWorkerQuantities(workers, workerQtys) : null;
  const countedTotal = hasWorkers
    ? workerSum
    : actualRaw === ""
      ? null
      : Number(actualRaw);

  const {
    diff,
    status,
    st,
    minimumStatus,
    minimumClasses,
    diffLabel,
    diffTone,
    diffBox,
    totalLabel,
  } = useCountDerived(countedTotal, systemQty, systemTotalQuantity, minimumQuantity);
  const meta = [barcode, sku, unit].filter(Boolean).join(" · ");

  if (variant === "card") {
    return (
      <div className={`rounded-2xl border px-3 py-3 ${st.row}`}>
        <div className="flex items-start gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white text-[#6c4cff] shadow-sm ring-1 ring-[#e7ecf5]">
            <Package className="h-5 w-5" strokeWidth={1.5} aria-hidden />
          </div>
          <div className="min-w-0 flex-1 text-end">
            <p className="break-words text-base font-black leading-tight text-slate-900">{name}</p>
            {meta ? (
              <p className="mt-0.5 truncate text-[11px] font-semibold tabular-nums text-slate-500">
                {meta}
              </p>
            ) : null}
          </div>
          {!readOnly ? (
            <button
              type="button"
              onClick={onEditProduct}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-[#e7ecf5] bg-white text-slate-600"
              aria-label={t("editProduct")}
            >
              <Pencil className="h-4 w-4" />
            </button>
          ) : null}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <StatBlock label={t("systemTotal")} value={systemTotalQuantity} />
          <StatBlock label={t("locationExpected")} value={systemQty} />
        </div>

        {hasWorkers ? (
          <div className="mt-3">
            <p className="mb-2 text-center text-[11px] font-black text-[#6c4cff]">
              {t("countSites")}
            </p>
            <CountSitesPanel
              workers={workers}
              workerQtys={workerQtys}
              onWorkerQtyChange={onWorkerQtyChange}
              countedTotalLabel={totalLabel}
              countedSumLabel={t("countedTotal")}
              readOnly={readOnly}
              stacked
            />
          </div>
        ) : (
          <div className="mt-3 rounded-xl bg-emerald-50/80 px-2 py-2 text-center ring-1 ring-emerald-200">
            <span className="block text-[10px] font-bold text-emerald-800">{t("countedTotal")}</span>
            <WorkerQtyInput
              value={actualRaw}
              onChange={onActualChange}
              readOnly={readOnly}
              className="mt-0.5 h-14 w-full border-0 bg-transparent text-center text-2xl font-black tabular-nums text-slate-900 outline-none"
            />
          </div>
        )}

        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className={`rounded-xl border px-2 py-2 text-center ${minimumClasses}`}>
            <span className="block text-[10px] font-bold">{t("minimum")}</span>
            <p className="mt-0.5 text-sm font-black tabular-nums">{minimumQuantity}</p>
          </div>
          <div className={`rounded-xl px-2 py-2 text-center ring-1 ${diffBox}`}>
            <span className="block text-[10px] font-bold text-slate-500">{t("diff")}</span>
            <p className={`mt-0.5 text-lg font-black tabular-nums ${diffTone}`}>{diffLabel}</p>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between gap-2 border-t border-[#e7ecf5]/80 pt-3">
          <div className="flex items-center gap-2">
            {!readOnly ? (
              <>
                <button
                  type="button"
                  onClick={() => onBump(-1)}
                  className="grid h-12 w-12 place-items-center rounded-2xl border border-[#e7ecf5] bg-white text-slate-700 active:scale-95"
                  aria-label="-1"
                >
                  <Minus className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={() => onBump(1)}
                  className="grid h-12 w-12 place-items-center rounded-2xl border border-[#e7ecf5] bg-white text-slate-700 active:scale-95"
                  aria-label="+1"
                >
                  <Plus className="h-5 w-5" />
                </button>
              </>
            ) : (
              <span />
            )}
          </div>
          <div className="flex flex-wrap justify-end gap-1.5">
            {minimumStatus === "below" ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-[11px] font-black text-rose-700 ring-1 ring-rose-200">
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                {t("minimumWarning")}
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1 rounded-full bg-white/80 px-2.5 py-1 text-[11px] font-black text-slate-700 ring-1 ring-[#e7ecf5]">
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />
              )}
              {countStatusLabel(status, t)}
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <CountTableGrid
      workers={workers}
      className={`rounded-2xl border px-2.5 py-2.5 text-[10px] font-bold transition-shadow duration-200 sm:px-3 ${st.row}`}
    >
      <div className="grid h-9 w-9 place-items-center justify-self-center rounded-xl bg-white text-[#6c4cff] shadow-sm ring-1 ring-[#e7ecf5]">
        <Package className="h-4 w-4" strokeWidth={1.5} aria-hidden />
      </div>

      <div className="min-w-0 text-end">
        <div className="flex items-start justify-end gap-1">
          {!readOnly ? (
            <button
              type="button"
              onClick={onEditProduct}
              className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg text-slate-500 hover:bg-white"
              aria-label={t("editProduct")}
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          ) : null}
          <div className="min-w-0">
            <p className="line-clamp-2 break-words text-sm font-black leading-tight text-slate-900 sm:text-[13px]">
              {name}
            </p>
            {meta ? (
              <p className="truncate text-[10px] font-semibold tabular-nums text-slate-500">
                {meta}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <MetricCell value={systemTotalQuantity} />
      <MetricCell value={systemQty} />

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

      <div className={`min-w-0 rounded-xl border px-1.5 py-2 text-center ${minimumClasses}`}>
        <p className="text-sm font-black tabular-nums">{minimumQuantity}</p>
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
        {minimumStatus === "below" ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-black text-rose-700 ring-1 ring-rose-200">
            <AlertTriangle className="h-3 w-3" aria-hidden />
            {t("minimumWarning")}
          </span>
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
