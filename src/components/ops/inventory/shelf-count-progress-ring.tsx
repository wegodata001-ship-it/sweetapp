"use client";

import { memo, useId, type CSSProperties } from "react";
import styles from "./shelf-count-progress-ring.module.css";

type Props = {
  timeLabel: string;
  progressPct: number;
  timeCaption: string;
  progressCaption?: string;
  active?: boolean;
  activeBadge?: string;
  className?: string;
};

function ShelfCountProgressRingInner({
  timeLabel,
  progressPct,
  timeCaption,
  progressCaption,
  active = false,
  activeBadge = "פעיל",
  className = "",
}: Props) {
  const pct = Math.min(100, Math.max(0, progressPct));
  const ringId = useId();

  return (
    <div
      className={`${styles.wrapper} ${active ? styles.wrapperActive : styles.wrapperIdle} ${className}`}
      role="presentation"
      dir="ltr"
      data-shelf-timer={ringId}
    >
      <div
        className={styles.progressRing}
        style={{ "--pct": String(pct) } as CSSProperties}
        aria-hidden
      />
      <div className={styles.content}>
        {active ? <span className={styles.badge}>{activeBadge}</span> : null}
        <p className={styles.time}>{timeLabel}</p>
        <p className={styles.caption}>{timeCaption}</p>
        <p className={styles.pct}>{progressCaption ?? `${pct}%`}</p>
      </div>
    </div>
  );
}

export const ShelfCountProgressRing = memo(ShelfCountProgressRingInner);
