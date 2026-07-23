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

/** productId → workerId → qty string */
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
  /** כמויות לפי עובד (כשיש עובדים במיקום) */
  workerQtys: WorkerQtyMap;
  /** סה״כ ידני — רק כשאין עובדים (תאימות לאחור) */
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

/** סה״כ נספר = סכום כמויות העובדים; ריק = 0 אם יש לפחות הזנה אחת */
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

/** רוחבי עמודות משותפים — כותרת + שורות חייבות להשתמש באותו template */
const COL = {
  icon: "2.5rem",
  product: "11rem",
  metric: "5.25rem",
  area: "5.75rem",
  qty: "5.75rem",
  counted: "5.75rem",
  min: "5.25rem",
  shortage: "6.75rem",
  diff: "4.75rem",
  actions: "8rem",
} as const;

export function countTableGridTemplate(workerCount: number): string {
  const workerCols = Array.from(
    { length: Math.max(0, workerCount) },
    () => `${COL.metric} ${COL.area} ${COL.qty}`,
  ).join(" ");
  return [
    COL.icon,
    COL.product,
    COL.metric,
    COL.metric,
    workerCols,
    COL.counted,
    COL.min,
    COL.shortage,
    COL.diff,
    COL.actions,
  ]
    .filter((part) => part.length > 0)
    .join(" ");
}

function CountTableGrid({
  workers,
  className,
  children,
}: {
  workers: LocationWorkerDto[];
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`grid min-w-max items-center gap-x-1.5 ${className ?? ""}`}
      style={{ gridTemplateColumns: countTableGridTemplate(workers.length) }}
    >
      {children}
    </div>
  );
}

function Cell({
  label,
  value,
  className,
  valueClassName,
  showLabel,
}: {
  label: string;
  value: ReactNode;
  className?: string;
  valueClassName?: string;
  showLabel?: boolean;
}) {
  return (
    <div
      className={`min-w-0 rounded-xl bg-white/90 px-1.5 py-1 text-center ring-1 ring-[#e7ecf5] ${className ?? ""}`}
    >
      {showLabel ? (
        <span className="block truncate text-[9px] font-bold text-slate-500">{label}</span>
      ) : null}
      <p className={`truncate text-sm font-black tabular-nums text-slate-800 ${valueClassName ?? ""}`}>
        {value}
      </p>
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

/** כותרת עמודות דינמית — אותו Grid כמו שורות הנתונים */
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
      className="rounded-2xl border border-[#e7ecf5] bg-[#f1f5f9] px-2.5 py-2 text-[10px] font-black text-slate-600 sm:px-3"
    >
      <div aria-hidden />
      <HeaderCell className="text-end">{t("productCol")}</HeaderCell>
      <HeaderCell>{t("systemTotal")}</HeaderCell>
      <HeaderCell>{t("locationExpected")}</HeaderCell>
      {workers.map((w) => {
        const displayName = w.displayName || "—";
        const workArea = (w.workArea || "").trim();
        return (
          <div key={w.id} className="contents">
            <HeaderCell className="text-[#6c4cff]">{displayName}</HeaderCell>
            <HeaderCell>{workArea || `${t("areaOf")} ${displayName}`}</HeaderCell>
            <HeaderCell className="text-emerald-700">{t("workerQty")}</HeaderCell>
          </div>
        );
      })}
      <HeaderCell>{t("countedTotal")}</HeaderCell>
      <HeaderCell>{t("minimum")}</HeaderCell>
      <HeaderCell>{t("systemShortage")}</HeaderCell>
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
  const totalLabel =
    actual === null || Number.isNaN(actual) ? "—" : String(actual);
  return { actual, diff, status, st, minimumStatus, minimumClasses, diffLabel, totalLabel };
}

function ShortageValue({
  systemShortage,
  minimumQuantity,
  systemTotalQuantity,
  t,
}: {
  systemShortage: number;
  minimumQuantity: number;
  systemTotalQuantity: number;
  t: (key: string) => string;
}) {
  if (systemShortage <= 0) {
    return <p className="text-sm font-black tabular-nums text-emerald-600">0</p>;
  }
  return (
    <div className="space-y-0 text-[10px] font-black leading-tight text-rose-600">
      <p>
        {t("shortageMin")}: {minimumQuantity}
      </p>
      <p>
        {t("shortageHave")}: {systemTotalQuantity}
      </p>
      <p>
        {t("shortageMissing")}: {systemShortage}
      </p>
    </div>
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
  systemShortage,
  minimumQuantity,
  workers,
  workerQtys,
  actualRaw,
  saving,
  readOnly = false,
  variant = "table",
  showColumnLabels = true,
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

  const { diff, status, st, minimumStatus, minimumClasses, diffLabel, totalLabel } =
    useCountDerived(countedTotal, systemQty, systemTotalQuantity, minimumQuantity);
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
          <button
            type="button"
            onClick={onEditProduct}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-[#e7ecf5] bg-white text-slate-600"
            aria-label={t("editProduct")}
          >
            <Pencil className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <StatBlock label={t("systemTotal")} value={systemTotalQuantity} />
          <StatBlock label={t("locationExpected")} value={systemQty} />

          {hasWorkers
            ? workers.map((w) => {
                const displayName = w.displayName || "—";
                const workArea = (w.workArea || "").trim();
                return (
                  <div key={w.id} className="col-span-2 space-y-2 rounded-2xl bg-slate-50/80 p-2 ring-1 ring-[#e7ecf5]">
                    <div className="grid grid-cols-2 gap-2">
                      <StatBlock label={t("workerName")} value={displayName} />
                      <StatBlock
                        label={t("workerArea")}
                        value={workArea || `${t("areaOf")} ${displayName}`}
                      />
                    </div>
                    <div className="rounded-xl bg-white px-2 py-2 text-center ring-1 ring-emerald-200">
                      <span className="block text-[10px] font-bold text-emerald-700">
                        {t("workerQty")}
                      </span>
                      <WorkerQtyInput
                        value={workerQtys[w.id] ?? ""}
                        onChange={(v) => onWorkerQtyChange(w.id, v)}
                        readOnly={readOnly}
                        className="mt-0.5 h-12 w-full border-0 bg-transparent text-center text-xl font-black tabular-nums text-slate-900 outline-none"
                      />
                    </div>
                  </div>
                );
              })
            : null}

          <div className="rounded-xl bg-emerald-50/80 px-2 py-2 text-center ring-1 ring-emerald-200">
            <span className="block text-[10px] font-bold text-emerald-800">{t("countedTotal")}</span>
            {hasWorkers ? (
              <p className="mt-0.5 text-xl font-black tabular-nums text-emerald-800">{totalLabel}</p>
            ) : (
              <WorkerQtyInput
                value={actualRaw}
                onChange={onActualChange}
                readOnly={readOnly}
                className="mt-0.5 h-12 w-full border-0 bg-transparent text-center text-xl font-black tabular-nums text-slate-900 outline-none"
              />
            )}
          </div>
          <div className={`rounded-xl border px-2 py-2 text-center ${minimumClasses}`}>
            <span className="block text-[10px] font-bold">{t("minimum")}</span>
            <p className="mt-0.5 text-sm font-black tabular-nums">{minimumQuantity}</p>
          </div>
          <StatBlock
            label={t("systemShortage")}
            value={
              <ShortageValue
                systemShortage={systemShortage}
                minimumQuantity={minimumQuantity}
                systemTotalQuantity={systemTotalQuantity}
                t={t}
              />
            }
          />
          <StatBlock
            label={t("diff")}
            value={diffLabel}
            valueClassName={
              diff === null
                ? "text-slate-400"
                : diff < 0
                  ? "text-rose-600"
                  : diff > 0
                    ? "text-amber-600"
                    : "text-emerald-600"
            }
          />
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
      className={`rounded-2xl border px-2.5 py-2 text-[10px] font-bold transition-shadow duration-200 sm:px-3 ${st.row}`}
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

      <Cell label={t("systemTotal")} value={systemTotalQuantity} showLabel={showColumnLabels} />
      <Cell label={t("locationExpected")} value={systemQty} showLabel={showColumnLabels} />

      {workers.map((w) => {
        const displayName = w.displayName || "—";
        const workArea = (w.workArea || "").trim();
        const areaLabel = workArea || `${t("areaOf")} ${displayName}`;
        return (
          <div key={w.id} className="contents">
            <Cell label={displayName} value={displayName} showLabel={showColumnLabels} />
            <Cell label={areaLabel} value={workArea || "—"} showLabel={showColumnLabels} />
            <div className="min-w-0 rounded-xl bg-white/90 px-1.5 py-1 text-center ring-1 ring-emerald-200">
              {showColumnLabels ? (
                <span className="block truncate text-[9px] font-bold text-emerald-700">
                  {t("workerQty")}
                </span>
              ) : null}
              <WorkerQtyInput
                value={workerQtys[w.id] ?? ""}
                onChange={(v) => onWorkerQtyChange(w.id, v)}
                readOnly={readOnly}
                className="w-full border-0 bg-transparent text-center text-sm font-black tabular-nums text-slate-900 outline-none"
              />
            </div>
          </div>
        );
      })}

      <div className="min-w-0 rounded-xl bg-emerald-50/90 px-1.5 py-1 text-center ring-1 ring-emerald-200">
        {showColumnLabels ? (
          <span className="block truncate text-[9px] font-bold text-emerald-800">
            {t("countedTotal")}
          </span>
        ) : null}
        {hasWorkers ? (
          <p className="text-sm font-black tabular-nums text-emerald-800">{totalLabel}</p>
        ) : (
          <WorkerQtyInput
            value={actualRaw}
            onChange={onActualChange}
            readOnly={readOnly}
            className="w-full border-0 bg-transparent text-center text-sm font-black tabular-nums text-slate-900 outline-none"
          />
        )}
      </div>

      <div className={`min-w-0 rounded-xl border px-1.5 py-1 text-center ${minimumClasses}`}>
        {showColumnLabels ? (
          <span className="block truncate text-[9px] font-bold">{t("minimum")}</span>
        ) : null}
        <p className="text-sm font-black tabular-nums">{minimumQuantity}</p>
      </div>

      <div className="min-w-0 rounded-xl bg-white/90 px-1.5 py-1 text-center ring-1 ring-[#e7ecf5]">
        {showColumnLabels ? (
          <span className="block truncate text-[9px] font-bold text-slate-500">
            {t("systemShortage")}
          </span>
        ) : null}
        <ShortageValue
          systemShortage={systemShortage}
          minimumQuantity={minimumQuantity}
          systemTotalQuantity={systemTotalQuantity}
          t={t}
        />
      </div>

      <Cell
        label={t("diff")}
        value={diffLabel}
        showLabel={showColumnLabels}
        valueClassName={
          diff === null
            ? "text-slate-400"
            : diff < 0
              ? "text-rose-600"
              : diff > 0
                ? "text-amber-600"
                : "text-emerald-600"
        }
      />

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
