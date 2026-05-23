"use client";

import { useI18n } from "@/components/i18n-provider";
import type { DashboardTimeRange } from "@/lib/dashboard/time-range";
import styles from "./dashboard-time-filter.module.css";

export type DashboardTimeFilterVariant = "wedding" | "z" | "expense";

type Props = {
  value: DashboardTimeRange;
  onChange: (range: DashboardTimeRange) => void;
  variant: DashboardTimeFilterVariant;
};

const RANGES: DashboardTimeRange[] = ["today", "week", "month"];

const LABEL_KEYS: Record<DashboardTimeRange, string> = {
  today: "dashboard.redesign.filter.today",
  week: "dashboard.redesign.filter.week",
  month: "dashboard.redesign.filter.month",
};

export function DashboardTimeFilter({ value, onChange, variant }: Props) {
  const { t } = useI18n();
  const variantClass =
    variant === "wedding" ? styles.wedding : variant === "z" ? styles.z : styles.expense;

  const buttons = (
    <div className={styles.group} role="group" aria-label={t("common.filter")}>
      {RANGES.map((range) => (
        <button
          key={range}
          type="button"
          className={`${styles.btn} ${value === range ? styles.active : ""}`}
          aria-pressed={value === range}
          onClick={() => onChange(range)}
        >
          {t(LABEL_KEYS[range])}
        </button>
      ))}
    </div>
  );

  return (
    <div className={`${styles.wrap} ${variantClass}`}>
      <div className={styles.scroll}>{buttons}</div>
    </div>
  );
}
