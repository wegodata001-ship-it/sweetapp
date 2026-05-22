"use client";

import { useMemo, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { formatShekel } from "@/lib/format-shekel";
import { smoothLinePath } from "@/components/dashboard/chart-utils";
import type { DailyPnlPoint } from "@/lib/dashboard/financial-engine";
import premium from "./dashboard-premium.module.css";
import styles from "./financial-analytics-chart.module.css";

export type ChartRange = "today" | "7d" | "30d" | "month";

const RANGES: ChartRange[] = ["today", "7d", "30d", "month"];

function filterByRange(data: DailyPnlPoint[], range: ChartRange): DailyPnlPoint[] {
  if (data.length === 0) return [];
  const todayKey = new Date().toISOString().slice(0, 10);
  if (range === "today") {
    const hit = data.find((d) => d.date === todayKey);
    return hit ? [hit] : [data[data.length - 1]!];
  }
  if (range === "7d") return data.slice(-7);
  if (range === "30d") return data.slice(-30);
  const now = new Date();
  const m = now.getMonth();
  const y = now.getFullYear();
  return data.filter((d) => {
    const dd = new Date(d.date + "T12:00:00");
    return dd.getMonth() === m && dd.getFullYear() === y;
  });
}

export function FinancialAnalyticsChart({ data }: { data: DailyPnlPoint[] }) {
  const { t } = useI18n();
  const [range, setRange] = useState<ChartRange>("7d");
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const series = useMemo(() => filterByRange(data, range), [data, range]);

  const { maxY, profitPath, barLayout } = useMemo(() => {
    const maxY = Math.max(1, ...series.flatMap((d) => [d.income, d.expenses, Math.abs(d.profit)]));
    const plotH = 1;
    const profits = series.map((d) => Math.max(0, d.profit));
    const profitPath =
      series.length > 1
        ? smoothLinePath(
            profits.map((p) => p / maxY),
            100,
            plotH,
            0,
          )
        : "";
    return { maxY, profitPath, barLayout: series };
  }, [series]);

  const yTicks = useMemo(() => {
    const steps = 4;
    return Array.from({ length: steps + 1 }, (_, i) => {
      const f = i / steps;
      return { label: formatShekel(Math.round(maxY * (1 - f))), pct: f * 100 };
    });
  }, [maxY]);

  const hovered = hoverIdx != null ? series[hoverIdx] : null;

  return (
    <div className={`${premium.glassCard} ${styles.wrap}`}>
      <div className={styles.header}>
        <h2 className={styles.title}>{t("dashboard.redesign.chartProfit")}</h2>
        <div className={styles.filters} role="tablist">
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
              role="tab"
              aria-selected={range === r}
              className={`${styles.filterBtn} ${range === r ? styles.filterActive : ""}`}
              onClick={() => setRange(r)}
            >
              {t(`dashboard.redesign.filter.${r}`)}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.chartBody}>
        <div className={styles.yAxis}>
          {yTicks.map((tick) => (
            <span key={tick.label} className={styles.yTick}>
              {tick.label}
            </span>
          ))}
        </div>

        <div className={styles.plotWrap}>
          {hovered ? (
            <div className={styles.tooltip} role="tooltip">
              <p className={styles.tooltipDay}>{hovered.label}</p>
              <p>
                <span className={styles.tIncome}>{t("dashboard.chartLegendIncome")}:</span>{" "}
                {formatShekel(hovered.income)}
              </p>
              <p>
                <span className={styles.tExpense}>{t("dashboard.chartLegendExpenses")}:</span>{" "}
                {formatShekel(hovered.expenses)}
              </p>
              <p>
                <span className={styles.tProfit}>{t("dashboard.chartLegendProfit")}:</span>{" "}
                {formatShekel(hovered.profit)}
              </p>
            </div>
          ) : null}

          <div className={styles.plot}>
            {barLayout.map((day, idx) => {
              const incomeH = (day.income / maxY) * 100;
              const expenseH = (day.expenses / maxY) * 100;
              const isHover = hoverIdx === idx;
              return (
                <div
                  key={day.date}
                  className={styles.barGroup}
                  onMouseEnter={() => setHoverIdx(idx)}
                  onMouseLeave={() => setHoverIdx(null)}
                >
                  <div className={styles.bars}>
                    <div
                      className={`${styles.bar} ${styles.barIncome}`}
                      style={{
                        height: `${incomeH}%`,
                        animationDelay: `${idx * 40}ms`,
                        opacity: isHover ? 1 : 0.88,
                      }}
                      title={formatShekel(day.income)}
                    />
                    <div
                      className={`${styles.bar} ${styles.barExpense}`}
                      style={{
                        height: `${expenseH}%`,
                        animationDelay: `${idx * 40 + 20}ms`,
                        opacity: isHover ? 1 : 0.88,
                      }}
                      title={formatShekel(day.expenses)}
                    />
                  </div>
                </div>
              );
            })}

            {series.length > 1 ? (
              <svg className={styles.profitLine} viewBox="0 0 100 100" preserveAspectRatio="none">
                <path
                  d={profitPath}
                  fill="none"
                  stroke="#eab308"
                  strokeWidth="2.5"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
            ) : null}
          </div>

          <div className={styles.xAxis}>
            {barLayout.map((day) => (
              <span key={day.date} className={styles.xLabel}>
                {day.label}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className={styles.legend}>
        <span>
          <i className={styles.dotIncome} /> {t("dashboard.chartLegendIncome")}
        </span>
        <span>
          <i className={styles.dotExpense} /> {t("dashboard.chartLegendExpenses")}
        </span>
        <span>
          <i className={styles.dotProfit} /> {t("dashboard.chartLegendProfit")}
        </span>
      </div>
    </div>
  );
}
