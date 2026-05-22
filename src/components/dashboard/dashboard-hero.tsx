"use client";

import { RefreshCw } from "lucide-react";
import { CountUp } from "@/components/count-up";
import { useI18n } from "@/components/i18n-provider";
import { StaffAlertsBell } from "@/components/staff-alerts-bell";
import type { TodayPnl } from "@/lib/dashboard/financial-engine";
import styles from "./dashboard-hero.module.css";

type Props = {
  todayPnl: TodayPnl;
  monthPnl: TodayPnl;
  updatedAt: string | null;
  loading: boolean;
  onRefresh: () => void;
};

type KpiVariant = "monthIncome" | "todayIncome" | "monthExpense" | "monthProfit";

function HeroKpi({
  variant,
  label,
  value,
  currency = true,
}: {
  variant: KpiVariant;
  label: string;
  value: number;
  currency?: boolean;
}) {
  const variantClass = {
    monthIncome: styles.kpiMonthIncome,
    todayIncome: styles.kpiTodayIncome,
    monthExpense: styles.kpiMonthExpense,
    monthProfit: styles.kpiMonthProfit,
  }[variant];

  return (
    <div className={`${styles.kpiCard} ${variantClass}`}>
      <p className={styles.kpiLabel}>{label}</p>
      <p className={styles.kpiValue}>
        <CountUp value={value} currency={currency} duration={1100} />
      </p>
    </div>
  );
}

export function DashboardHero({ todayPnl, monthPnl, updatedAt, loading, onRefresh }: Props) {
  const { t } = useI18n();
  const timeLabel = updatedAt
    ? new Date(updatedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
    : "—";

  return (
    <section className={styles.hero}>
      <div className={styles.bgFloat} aria-hidden />
      <div className={styles.particles} aria-hidden>
        <span className={styles.particle} />
        <span className={styles.particle} />
        <span className={styles.particle} />
        <span className={styles.particle} />
        <span className={styles.particle} />
      </div>

      <div className={styles.toolbar}>
        <span className={styles.toolBtn}>
          {t("dashboard.redesign.lastUpdate")}: {timeLabel}
        </span>
        <button type="button" className={styles.toolBtn} onClick={onRefresh} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} aria-hidden />
          {t("dashboard.redesign.refresh")}
        </button>
        <StaffAlertsBell />
      </div>

      <div className={styles.body}>
        <div className={styles.topRow}>
          <div className={styles.titleBlock}>
            <p className={styles.eyebrow}>{t("dashboard.redesign.heroEyebrow")}</p>
            <h1 className={`${styles.heroTitle} font-arabic-brand`}>{t("dashboard.redesign.heroTitle")}</h1>
            <p className={styles.heroSubtitle}>{t("dashboard.redesign.heroSubtitle")}</p>
          </div>

          <div className={styles.profitCard}>
            <p className={styles.profitLabel}>{t("dashboard.redesign.heroNetProfitToday")}</p>
            <p className={styles.profitAmount}>
              <CountUp value={todayPnl.profit} currency duration={1200} />
            </p>
            <div className={styles.profitMeta}>
              <span>
                {t("dashboard.chartLegendIncome")}:{" "}
                <CountUp value={todayPnl.income} currency duration={1000} className={styles.metaIncome} />
              </span>
              <span>
                {t("dashboard.chartLegendExpenses")}:{" "}
                <CountUp value={todayPnl.expenses} currency duration={1000} className={styles.metaExpense} />
              </span>
            </div>
          </div>
        </div>

        <div className={styles.kpiGrid}>
          <HeroKpi
            variant="monthIncome"
            label={t("dashboard.redesign.heroMonthIncome")}
            value={monthPnl.income}
          />
          <HeroKpi
            variant="todayIncome"
            label={t("dashboard.redesign.heroTodayIncome")}
            value={todayPnl.income}
          />
          <HeroKpi
            variant="monthExpense"
            label={t("dashboard.redesign.heroMonthExpenses")}
            value={monthPnl.expenses}
          />
          <HeroKpi
            variant="monthProfit"
            label={t("dashboard.redesign.heroMonthProfit")}
            value={monthPnl.profit}
          />
        </div>
      </div>
    </section>
  );
}
