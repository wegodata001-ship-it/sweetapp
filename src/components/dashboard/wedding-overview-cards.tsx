"use client";

import { useMemo, useState } from "react";
import { Gem, Heart, FileBadge } from "lucide-react";
import { CountUp } from "@/components/count-up";
import { useI18n } from "@/components/i18n-provider";
import { DashboardTimeFilter } from "@/components/dashboard/dashboard-time-filter";
import type { WeddingSectionStats } from "@/lib/dashboard/summary";
import type { DashboardTimeRange, RangeKeyed } from "@/lib/dashboard/time-range";
import fade from "@/components/dashboard/section-fade.module.css";
import styles from "./wedding-overview-cards.module.css";

const SPARK_HEIGHTS = [0.35, 0.55, 0.75, 0.5, 0.9, 0.65] as const;

function MiniSpark({ value }: { value: number }) {
  const scale = value > 0 ? 1 : 0.25;
  return (
    <div className={styles.spark} aria-hidden>
      {SPARK_HEIGHTS.map((h, i) => (
        <span
          key={i}
          className={styles.sparkBar}
          style={{
            height: `${h * scale * 100}%`,
            animationDelay: `${i * 60}ms`,
          }}
        />
      ))}
    </div>
  );
}

export function WeddingOverviewCards({ dataByRange }: { dataByRange: RangeKeyed<WeddingSectionStats> }) {
  const { t } = useI18n();
  const [range, setRange] = useState<DashboardTimeRange>("today");

  const data = useMemo(() => dataByRange[range], [dataByRange, range]);

  const cards = [
    { key: "weddings" as const, value: data.weddings, icon: Heart, tone: styles.weddings },
    { key: "orders" as const, value: data.orders, icon: Gem, tone: styles.orders },
    { key: "documented" as const, value: data.documented, icon: FileBadge, tone: styles.documented },
  ];

  const labels: Record<(typeof cards)[number]["key"], string> = {
    weddings: "dashboard.redesign.weddings",
    orders: "dashboard.redesign.orders",
    documented: "dashboard.redesign.documented",
  };

  return (
    <div className={styles.section}>
      <div className={styles.head}>
        <h2 className={`${styles.title} font-arabic-brand`}>{t("dashboard.redesign.sectionWeddings")}</h2>
        <DashboardTimeFilter value={range} onChange={setRange} variant="wedding" />
      </div>
      <div key={range} className={`${styles.list} ${fade.fade}`}>
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <div key={c.key} className={`${styles.card} ${c.tone}`}>
              <span className={styles.iconRing}>
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <div className={styles.body}>
                <p className={styles.label}>{t(labels[c.key])}</p>
                <p className={styles.value}>
                  <CountUp value={c.value} duration={900} />
                </p>
                <MiniSpark value={c.value} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
