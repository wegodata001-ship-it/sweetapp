"use client";

import { useMemo, useState } from "react";
import { Banknote, CreditCard, FileCheck, Layers, Receipt } from "lucide-react";
import { CountUp } from "@/components/count-up";
import { useI18n } from "@/components/i18n-provider";
import { DashboardTimeFilter } from "@/components/dashboard/dashboard-time-filter";
import type { ZPosMetrics } from "@/lib/dashboard/financial-engine";
import type { DashboardTimeRange, RangeKeyed } from "@/lib/dashboard/time-range";
import fade from "@/components/dashboard/section-fade.module.css";
import styles from "./z-report-cards.module.css";

const ITEMS = [
  { key: "reports", field: "reportsToday" as const, icon: Receipt, currency: false, tone: "reports" },
  { key: "cash", field: "cashToday" as const, icon: Banknote, currency: true, tone: "cash" },
  { key: "card", field: "cardToday" as const, icon: CreditCard, currency: true, tone: "cardPay" },
  { key: "checks", field: "checksToday" as const, icon: FileCheck, currency: true, tone: "checks" },
  { key: "other", field: "otherToday" as const, icon: Layers, currency: true, tone: "other" },
] as const;

const LABEL_KEYS: Record<(typeof ITEMS)[number]["key"], string> = {
  reports: "dashboard.redesign.zReportsCount",
  cash: "dashboard.redesign.zCash",
  card: "dashboard.redesign.zCard",
  checks: "dashboard.redesign.zChecks",
  other: "dashboard.redesign.zOther",
};

const TONE_CLASS: Record<(typeof ITEMS)[number]["tone"], string> = {
  reports: styles.reports,
  cash: styles.cash,
  cardPay: styles.cardPay,
  checks: styles.checks,
  other: styles.other,
};

export function ZReportCards({ dataByRange }: { dataByRange: RangeKeyed<ZPosMetrics> }) {
  const { t } = useI18n();
  const [range, setRange] = useState<DashboardTimeRange>("today");
  const data = useMemo(() => dataByRange[range], [dataByRange, range]);

  return (
    <div className={styles.section}>
      <div className={styles.head}>
        <h2 className={`${styles.title} font-arabic-brand`}>{t("dashboard.redesign.sectionZ")}</h2>
        <DashboardTimeFilter value={range} onChange={setRange} variant="z" />
      </div>
      <div key={range} className={`${styles.grid} ${fade.fade}`}>
        {ITEMS.map((item) => {
          const Icon = item.icon;
          const value = data[item.field];
          return (
            <div key={item.key} className={`${styles.card} ${TONE_CLASS[item.tone]}`}>
              <div className={styles.iconWrap}>
                <Icon className="h-3.5 w-3.5" aria-hidden />
              </div>
              <p className={styles.label}>{t(LABEL_KEYS[item.key])}</p>
              <p className={styles.value}>
                {item.currency ? (
                  <CountUp value={value} currency duration={1000} />
                ) : (
                  <CountUp value={value} duration={800} />
                )}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
