"use client";

import type { ReactNode } from "react";
import { Banknote, CalendarRange, RefreshCw, TrendingDown, TrendingUp, Wallet } from "lucide-react";
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

function ExpenseDelta({ pct }: { pct: number | null }) {
  const { t } = useI18n();
  if (pct === null) {
    return <span className={styles.deltaMuted}>{t("dashboard.trendNoChange")}</span>;
  }
  const up = pct > 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span className={up ? styles.deltaUp : styles.deltaDown}>
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {t(up ? "dashboard.redesign.heroVsYesterdayUp" : "dashboard.redesign.heroVsYesterdayDown", {
        pct: Math.abs(pct),
      })}
    </span>
  );
}

export function DashboardHero({ hero, updatedAt, loading, onRefresh }: Props) {
  const { t } = useI18n();
  const timeLabel = updatedAt
    ? new Date(updatedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
    : "—";

  const { todayIncomeByMethod: br } = hero;

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
                    <Banknote className="h-7 w-7" aria-hidden />
                  </span>
                  <p className={styles.mainLabel}>{t("dashboard.redesign.heroTotalIncomeToday")}</p>
                </div>
                <p className={styles.mainAmount}>
                  <CountUp value={hero.todayIncomeTotal} currency duration={1200} />
                </p>
                <div className={styles.breakdown}>
                  <span>
                    {t("dashboard.redesign.heroBreakdownCash")}:{" "}
                    <CountUp value={br.cash} currency duration={900} className={styles.brCash} />
                  </span>
                  <span className={styles.breakdownSep}>·</span>
                  <span>
                    {t("dashboard.redesign.heroBreakdownCard")}:{" "}
                    <CountUp value={br.card} currency duration={900} className={styles.brCard} />
                  </span>
                  <span className={styles.breakdownSep}>·</span>
                  <span>
                    {t("dashboard.redesign.heroBreakdownChecks")}:{" "}
                    <CountUp value={br.check} currency duration={900} className={styles.brCheck} />
                  </span>
                  {br.other > 0 ? (
                    <>
                      <span className={styles.breakdownSep}>·</span>
                      <span>
                        {t("dashboard.redesign.zOther")}:{" "}
                        <CountUp value={br.other} currency duration={900} />
                      </span>
                    </>
                  ) : null}
                </div>
              </div>
            </div>

            <div className={styles.miniGrid}>
              <MiniKpi
                variant="expense"
                label={t("dashboard.redesign.heroExpensesToday")}
                value={hero.todayExpenses}
                icon={TrendingDown}
                sub={<ExpenseDelta pct={hero.expenseChangeVsYesterdayPct} />}
              />
              <MiniKpi
                variant="income"
                label={t("dashboard.redesign.heroTodayIncome")}
                value={hero.todayIncomeTotal}
                icon={TrendingUp}
              />
              <MiniKpi
                variant="cash"
                label={t("dashboard.redesign.heroCashIncomeToday")}
                value={hero.todayCashIncome}
                icon={Wallet}
              />
              <MiniKpi
                variant="month"
                label={t("dashboard.redesign.heroMonthIncomeOnly")}
                value={hero.monthIncome}
                icon={CalendarRange}
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
