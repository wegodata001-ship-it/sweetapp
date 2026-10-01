"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { Banknote, HandCoins, RefreshCw, TrendingDown, TrendingUp, Users, Wallet } from "lucide-react";
import { CountUp } from "@/components/count-up";
import { CustomerDebtModal, FinancialSummaryModal, OpenPayablesModal } from "@/components/dashboard/dashboard-finance-modals";
import { DashboardTimeFilter } from "@/components/dashboard/dashboard-time-filter";
import { useI18n } from "@/components/i18n-provider";
import { StaffAlertsBell } from "@/components/staff-alerts-bell";
import type { DashboardHeroMetrics } from "@/lib/dashboard/financial-engine";
import { DEFAULT_HERO_RANGE, heroPeriodCacheKey, heroSlice } from "@/lib/dashboard/hero-period";
import type { DashboardTimeRange } from "@/lib/dashboard/time-range";
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
  onClick,
}: {
  variant: MiniVariant;
  label: string;
  value: number;
  sub?: ReactNode;
  icon: typeof Wallet;
  onClick?: () => void;
}) {
  const variantClass = {
    expense: styles.miniExpense,
    income: styles.miniIncome,
    cash: styles.miniCash,
    month: styles.miniMonth,
  }[variant];
  const Tag = onClick ? "button" : "div";

  return (
    <Tag type={onClick ? "button" : undefined} onClick={onClick} className={`${styles.miniCard} ${variantClass}`}>
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
    </Tag>
  );
}

export function DashboardHero({ hero, updatedAt, loading, onRefresh }: Props) {
  const { t } = useI18n();
  const [range, setRange] = useState<DashboardTimeRange>(DEFAULT_HERO_RANGE);
  const periodKey = heroPeriodCacheKey(range, updatedAt);
  const slice = useMemo(() => heroSlice(hero, range), [hero, range, periodKey]);
  const incomeLabel =
    range === "today"
      ? t("dashboard.redesign.heroTodayIncome")
      : range === "week"
        ? t("dashboard.redesign.heroIncomeWeek")
        : t("dashboard.redesign.heroIncomeMonth");
  const cashIncomeLabel =
    range === "today"
      ? t("dashboard.redesign.heroCashIncomeToday")
      : range === "week"
        ? t("dashboard.redesign.heroCashIncomeWeek")
        : t("dashboard.redesign.heroCashIncomeMonth");
  const expensesLabel =
    range === "today"
      ? t("dashboard.redesign.heroExpensesToday")
      : range === "week"
        ? t("dashboard.redesign.heroExpensesWeek")
        : t("dashboard.redesign.heroExpensesMonth");
  const [debtTotal, setDebtTotal] = useState(0);
  const [debtCount, setDebtCount] = useState(0);
  const [debtOpen, setDebtOpen] = useState(false);
  const [payableTotal, setPayableTotal] = useState(0);
  const [payablesOpen, setPayablesOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const timeLabel = updatedAt
    ? new Date(updatedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
    : "—";

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/ledger/v2/overview?side=DEBT&sort=debt&pageSize=5", { credentials: "same-origin" })
      .then((res) => res.json())
      .then((body: { ok?: boolean; totals?: { totalDebt?: number; customersWithDebt?: number } }) => {
        if (cancelled || !body.ok || !body.totals) return;
        setDebtTotal(body.totals.totalDebt ?? 0);
        setDebtCount(body.totals.customersWithDebt ?? 0);
      })
      .catch(() => {
        if (cancelled) return;
        setDebtTotal(0);
        setDebtCount(0);
      });
    void fetch("/api/ledger/payables", { credentials: "same-origin" })
      .then((res) => res.json())
      .then((body: { ok?: boolean; total?: number }) => {
        if (cancelled || !body.ok) return;
        setPayableTotal(body.total ?? 0);
      })
      .catch(() => {
        if (cancelled) return;
        setPayableTotal(0);
      });
    return () => {
      cancelled = true;
    };
  }, [updatedAt]);

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
        <DashboardTimeFilter value={range} onChange={setRange} variant="hero" />
        <div className={styles.toolbarActions}>
          <span className={styles.toolBtn}>
            {t("dashboard.redesign.lastUpdate")}: {timeLabel}
          </span>
          <button type="button" className={styles.toolBtn} onClick={() => setSummaryOpen(true)}>
            {t("dashboard.redesign.financialSummary")}
          </button>
          <button type="button" className={styles.toolBtn} onClick={onRefresh} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} aria-hidden />
            {t("dashboard.redesign.refresh")}
          </button>
          <StaffAlertsBell />
        </div>
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
                  <CountUp value={slice.cashBalance} currency duration={1200} />
                </p>
              </div>
            </div>

            <div className={styles.miniGrid}>
              <MiniKpi
                variant="month"
                label={incomeLabel}
                value={slice.income}
                icon={TrendingUp}
              />
              <MiniKpi
                variant="cash"
                label={cashIncomeLabel}
                value={slice.cashIncome}
                icon={Banknote}
              />
              <MiniKpi
                variant="income"
                label={t("dashboard.redesign.customerDebt")}
                value={debtTotal}
                sub={<span>{t("dashboard.redesign.customersInDebt", { count: debtCount })}</span>}
                icon={Users}
                onClick={() => setDebtOpen(true)}
              />
              <MiniKpi
                variant="income"
                label={expensesLabel}
                value={slice.expenses}
                icon={TrendingDown}
              />
              <MiniKpi
                variant="expense"
                label={t("dashboard.redesign.oweOthers")}
                value={payableTotal}
                icon={HandCoins}
                onClick={() => setPayablesOpen(true)}
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
      <CustomerDebtModal open={debtOpen} totalDebt={debtTotal} count={debtCount} onClose={() => setDebtOpen(false)} />
      <OpenPayablesModal
        open={payablesOpen}
        total={payableTotal}
        refreshKey={updatedAt}
        onClose={() => setPayablesOpen(false)}
      />
      <FinancialSummaryModal open={summaryOpen} onClose={() => setSummaryOpen(false)} />
    </section>
  );
}
