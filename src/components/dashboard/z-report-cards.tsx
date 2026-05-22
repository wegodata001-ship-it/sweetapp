"use client";

import { Banknote, CreditCard, FileCheck, Layers, Receipt } from "lucide-react";
import { CountUp } from "@/components/count-up";
import { useI18n } from "@/components/i18n-provider";
import type { ZPosMetrics } from "@/lib/dashboard/financial-engine";
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

export function ZReportCards({ data }: { data: ZPosMetrics }) {
  const { t } = useI18n();

  return (
    <div className={styles.section}>
      <h2 className={`${styles.title} font-arabic-brand`}>{t("dashboard.redesign.sectionZ")}</h2>
      <div className={styles.grid}>
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
                {item.currency ? <CountUp value={value} currency duration={1000} /> : <CountUp value={value} duration={800} />}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
