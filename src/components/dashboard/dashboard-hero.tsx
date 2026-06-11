"use client";

import type { ReactNode } from "react";
import { Banknote, RefreshCw, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { CountUp } from "@/components/count-up";
import { useI18n } from "@/components/i18n-provider";
import { StaffAlertsBell } from "@/components/staff-alerts-bell";
import type { DashboardHeroMetrics } from "@/lib/dashboard/financial-engine";
import styles from "./dashboard-hero.module.css";

type Props = {
  hero: DashboardHeroMetrics;
  updatedAt: string | null;
  loading: boolean;
  onRefresh: () => void;
};

type MiniVariant = "expense" | "income" | "cash" | "month";

function MiniKpi({
  variant,
  label,
  value,
  sub,
  icon: Icon,
}: {
  variant: MiniVariant;
  label: string;
  value: number;
  sub?: ReactNode;
  icon: typeof Wallet;
}) {
  const variantClass = {
    expense: styles.miniExpense,
    income: styles.miniIncome,
    cash: styles.miniCash,
    month: styles.miniMonth,
  }[variant];

  return (
    <div className={`${styles.miniCard} ${variantClass}`}>
      <div className={styles.miniHeader}>
        <span className={styles.miniIconWrap}>
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <p className={styles.miniLabel}>{label}</p>
      </div>
      <p className={styles.miniValue}>
        <CountUp value={value} currency duration={1000} />
      </p>
      {sub ? <div className={styles.miniSub}>{sub}</div> : null}
    </div>
  );
}

export function DashboardHero({ hero, updatedAt, loading, onRefresh }: Props) {
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
        <div className={styles.layout}>
          <div className={styles.metricsCol}>
            <div className={styles.mainCard}>
              <div className={styles.mainCardGlow} aria-hidden />
              <div className={styles.mainCardInner}>
                <div className={styles.mainCardTop}>
                  <span className={styles.mainIconWrap}>
                    <Wallet className="h-7 w-7" aria-hidden />
                  </span>
                  <p className={styles.mainLabel}>{t("dashboard.redesign.heroCashBalanceSystem")}</p>
                </div>
                <p className={styles.mainAmount}>
                  <CountUp value={hero.monthCashBalance} currency duration={1200} />
                </p>
              </div>
            </div>

            <div className={styles.miniGrid}>
              <MiniKpi
                variant="month"
                label={t("dashboard.redesign.heroIncomeMonth")}
                value={hero.monthIncome}
                icon={TrendingUp}
              />
              <MiniKpi
                variant="cash"
                label={t("dashboard.redesign.heroCashIncomeMonth")}
                value={hero.monthCashIncome}
                icon={Banknote}
              />
              <MiniKpi
                variant="income"
                label={t("dashboard.redesign.heroExpensesMonth")}
                value={hero.monthExpenses}
                icon={TrendingDown}
              />
              <MiniKpi
                variant="expense"
                label={t("dashboard.redesign.heroProfitLossMonth")}
                value={hero.monthProfit}
                icon={hero.monthProfit >= 0 ? TrendingUp : TrendingDown}
              />
            </div>
          </div>

          <div className={styles.titleCol}>
            <p className={styles.eyebrow}>{t("dashboard.redesign.heroEyebrow")}</p>
            <h1 className={`${styles.heroTitle} font-arabic-brand`}>{t("dashboard.redesign.heroTitle")}</h1>
            <p className={styles.heroSubtitle}>{t("dashboard.redesign.heroSubtitle")}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
