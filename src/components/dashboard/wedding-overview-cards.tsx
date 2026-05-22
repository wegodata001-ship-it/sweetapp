"use client";

import { Gem, Heart, FileBadge } from "lucide-react";
import { CountUp } from "@/components/count-up";
import { useI18n } from "@/components/i18n-provider";
import styles from "./wedding-overview-cards.module.css";

type WeddingData = { weddings: number; orders: number; documented: number };

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

export function WeddingOverviewCards({ data }: { data: WeddingData }) {
  const { t } = useI18n();
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
      <h2 className={`${styles.title} font-arabic-brand`}>{t("dashboard.redesign.sectionWeddings")}</h2>
      <div className={styles.list}>
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
