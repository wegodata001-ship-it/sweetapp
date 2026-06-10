"use client";

import { CheckCircle2, Minus, Plus, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { formatShekel } from "@/lib/format-shekel";
import type { ScannedItemDto } from "@/components/document-scan-dialog";

type Summary = {
  unchanged: number;
  newItems: number;
  increased: number;
  decreased: number;
  total: number;
};

export function ScanPriceCompareSummary({
  summary,
}: {
  summary: Summary;
}) {
  const { t } = useI18n();
  if (summary.total === 0) return null;

  const rows = [
    summary.unchanged > 0
      ? { icon: CheckCircle2, color: "text-emerald-700", label: t("scan.priceCompare.summaryUnchanged", { count: String(summary.unchanged) }) }
      : null,
    summary.newItems > 0
      ? { icon: Sparkles, color: "text-emerald-600", label: t("scan.priceCompare.summaryNew", { count: String(summary.newItems) }) }
      : null,
    summary.increased > 0
      ? { icon: TrendingUp, color: "text-amber-700", label: t("scan.priceCompare.summaryIncreased", { count: String(summary.increased) }) }
      : null,
    summary.decreased > 0
      ? { icon: TrendingDown, color: "text-blue-700", label: t("scan.priceCompare.summaryDecreased", { count: String(summary.decreased) }) }
      : null,
  ].filter(Boolean) as Array<{ icon: typeof CheckCircle2; color: string; label: string }>;

  if (rows.length === 0) return null;

  return (
    <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {t("scan.priceCompare.summaryTitle")}
      </p>
      <ul className="space-y-1.5">
        {rows.map(({ icon: Icon, color, label }) => (
          <li key={label} className={`flex items-center gap-2 text-sm font-medium ${color}`}>
            <Icon className="h-4 w-4 shrink-0" aria-hidden />
            <span>{label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ScanItemPriceCompareRow({ item }: { item: ScannedItemDto }) {
  const { t } = useI18n();
  const status = item.priceCompareStatus;

  if (!status) return null;

  if (status === "new") {
    return (
      <div className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
        <Sparkles className="h-3.5 w-3.5" aria-hidden />
        {t("scan.priceCompare.itemNew")}
      </div>
    );
  }

  if (status === "unchanged") {
    return (
      <div className="mt-2 flex items-center gap-1.5 text-xs font-medium text-emerald-700">
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
        {t("scan.priceCompare.itemUnchanged")}
      </div>
    );
  }

  const prev = item.regularPrice;
  const isUp = status === "increased";

  return (
    <div
      className={`mt-2 rounded-lg border px-2.5 py-2 text-xs ${
        isUp ? "border-amber-200 bg-amber-50 text-amber-950" : "border-blue-200 bg-blue-50 text-blue-950"
      }`}
    >
      <div className="flex items-center gap-1.5 font-semibold">
        {isUp ? (
          <TrendingUp className="h-3.5 w-3.5 text-amber-700" aria-hidden />
        ) : (
          <TrendingDown className="h-3.5 w-3.5 text-blue-700" aria-hidden />
        )}
        {isUp ? t("scan.priceCompare.itemIncreased") : t("scan.priceCompare.itemDecreased")}
      </div>
      {prev != null && prev > 0 ? (
        <div className="mt-1 space-y-0.5 text-[11px] leading-relaxed opacity-90">
          <p>
            {t("scan.priceCompare.previousPrice")}: {formatShekel(prev)}
          </p>
          <p>
            {t("scan.priceCompare.newPrice")}: {formatShekel(item.unitPrice)}
          </p>
          {item.priceDeltaAmount != null ? (
            <p className="flex flex-wrap items-center gap-1 font-semibold">
              <span>{t("scan.priceCompare.change")}:</span>
              <span className="inline-flex items-center gap-0.5">
                {isUp ? <Plus className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                {formatShekel(Math.abs(item.priceDeltaAmount))}
              </span>
              {item.priceDeltaPercent != null ? (
                <span>
                  ({isUp ? "+" : ""}
                  {item.priceDeltaPercent}%)
                </span>
              ) : null}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
