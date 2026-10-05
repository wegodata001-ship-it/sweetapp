"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import {
  defaultDashboardPeriod,
  formatCustomPeriodLabel,
  localizedMonthName,
  selectionForPreset,
  validateCustomRange,
  type DashboardPeriodSelection,
} from "@/lib/dashboard/dashboard-period";
import type { DashboardTimeRange } from "@/lib/dashboard/time-range";
import styles from "./dashboard-time-filter.module.css";

export type DashboardTimeFilterVariant = "wedding" | "z" | "expense" | "hero";

type Props = {
  selection: DashboardPeriodSelection;
  onChange: (selection: DashboardPeriodSelection) => void;
  variant: DashboardTimeFilterVariant;
};

const RANGES: DashboardTimeRange[] = ["today", "week", "month"];

const LABEL_KEYS: Record<DashboardTimeRange, string> = {
  today: "dashboard.redesign.filter.today",
  week: "dashboard.redesign.filter.week",
  month: "dashboard.redesign.filter.month",
};

export function DashboardTimeFilter({ selection, onChange, variant }: Props) {
  const { t, bcp47 } = useI18n();
  const monthName = localizedMonthName(new Date(), bcp47);
  const popoverId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(selection.period === "custom" ? selection.from : defaultDashboardPeriod().from);
  const [to, setTo] = useState(selection.period === "custom" ? selection.to : defaultDashboardPeriod().to);
  const [error, setError] = useState<string | null>(null);

  const variantClass =
    variant === "wedding"
      ? styles.wedding
      : variant === "z"
        ? styles.z
        : variant === "hero"
          ? styles.hero
          : styles.expense;

  useEffect(() => {
    if (selection.period === "custom") {
      setFrom(selection.from);
      setTo(selection.to);
    }
  }, [selection.period, selection.from, selection.to]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const applyCustom = () => {
    const issue = validateCustomRange(from, to);
    if (issue === "invalid") {
      setError(t("dashboard.redesign.filter.invalidDate"));
      return;
    }
    if (issue === "order") {
      setError(t("dashboard.redesign.filter.orderError"));
      return;
    }
    setError(null);
    setOpen(false);
    onChange({ period: "custom", from, to });
  };

  const customActive = selection.period === "custom";
  const customLabel = customActive ? formatCustomPeriodLabel(selection.from, selection.to, bcp47) : "+";

  return (
    <div ref={rootRef} className={`${styles.wrap} ${variantClass}`}>
      <div className={styles.scroll}>
        <div className={styles.group} role="group" aria-label={t("common.filter")}>
          {RANGES.map((range) => (
            <button
              key={range}
              type="button"
              className={`${styles.btn} ${selection.period === range ? styles.active : ""}`}
              aria-pressed={selection.period === range}
              onClick={() => {
                setOpen(false);
                onChange(selectionForPreset(range));
              }}
            >
              {range === "month" ? `${t(LABEL_KEYS[range])} · ${monthName}` : t(LABEL_KEYS[range])}
            </button>
          ))}
          <button
            type="button"
            className={`${styles.btn} ${styles.plus} ${customActive ? styles.active : ""}`}
            aria-pressed={customActive}
            aria-expanded={open}
            aria-controls={popoverId}
            title={t("dashboard.redesign.filter.custom")}
            onClick={() => {
              setError(null);
              setOpen((prev) => !prev);
            }}
          >
            {customLabel}
          </button>
        </div>
      </div>
      {open ? (
        <div id={popoverId} className={styles.popover} role="dialog" aria-label={t("dashboard.redesign.filter.custom")}>
          <p className={styles.popoverTitle}>{t("dashboard.redesign.filter.custom")}</p>
          <label className={styles.field}>
            <span>{t("dashboard.redesign.filter.fromDate")}</span>
            <input
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setError(null);
              }}
            />
          </label>
          <label className={styles.field}>
            <span>{t("dashboard.redesign.filter.toDate")}</span>
            <input
              type="date"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setError(null);
              }}
            />
          </label>
          {error ? <p className={styles.error}>{error}</p> : null}
          <div className={styles.actions}>
            <button type="button" className={styles.ghost} onClick={() => setOpen(false)}>
              {t("common.cancel")}
            </button>
            <button type="button" className={styles.apply} onClick={applyCustom}>
              {t("dashboard.redesign.filter.apply")}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
