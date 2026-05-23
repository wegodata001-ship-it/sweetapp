"use client";

import { memo, useEffect, useId, useMemo, useRef, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { computeCountdownTimer, type TimerVisualTier } from "@/lib/tasks/countdown-timer";
import styles from "./task-countdown-ring.module.css";

const RING_R = 88;
const RING_C = 2 * Math.PI * RING_R;

type Props = {
  taskTitle?: string;
  estimatedMinutes: number;
  startedAt: string | null;
  completedAt?: string | null;
  taskStatus: string;
  paused?: boolean;
  size?: "compact" | "default" | "large";
  showMeta?: boolean;
  showTitle?: boolean;
  className?: string;
};

const TIER_CLASS: Record<TimerVisualTier, string> = {
  onTrack: styles.onTrack,
  warning: styles.warning,
  danger: styles.danger,
  overdue: styles.overdue,
  paused: styles.paused,
  idle: styles.idle,
  done: styles.done,
};

function TaskCountdownRingInner({
  taskTitle,
  estimatedMinutes,
  startedAt,
  completedAt,
  taskStatus,
  paused = false,
  size = "default",
  showMeta = true,
  showTitle = true,
  className = "",
}: Props) {
  const { t, locale } = useI18n();
  const gradId = useId().replace(/:/g, "");
  const [tick, setTick] = useState(() => Math.floor(Date.now() / 1000));
  const [displayFlash, setDisplayFlash] = useState(false);
  const rafRef = useRef(0);
  const lastSecRef = useRef(0);
  const prevDisplayRef = useRef("");

  const isLive =
    taskStatus === "IN_PROGRESS" && Boolean(startedAt) && !completedAt && !paused;

  useEffect(() => {
    if (!isLive) return;
    const loop = () => {
      const sec = Math.floor(Date.now() / 1000);
      if (sec !== lastSecRef.current) {
        lastSecRef.current = sec;
        setTick(sec);
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isLive, startedAt, estimatedMinutes, paused, taskStatus]);

  const snap = useMemo(
    () =>
      computeCountdownTimer({
        estimatedMinutes,
        startedAt,
        completedAt,
        taskStatus,
        paused,
        nowMs: Date.now(),
        locale,
      }),
    [
      estimatedMinutes,
      startedAt,
      completedAt,
      taskStatus,
      paused,
      tick,
      isLive,
      locale,
    ],
  );

  useEffect(() => {
    if (snap.display !== prevDisplayRef.current) {
      prevDisplayRef.current = snap.display;
      setDisplayFlash(true);
      const id = window.setTimeout(() => setDisplayFlash(false), 280);
      return () => window.clearTimeout(id);
    }
  }, [snap.display]);

  const strokeOffset = RING_C * (1 - snap.ringProgress);
  const tierClass = TIER_CLASS[snap.visualTier] ?? styles.idle;
  const sizeClass =
    size === "large" ? styles.sizeLarge : size === "compact" ? styles.sizeCompact : styles.sizeDefault;

  const statusLabel = t(`tasks.timer.status.${snap.statusKey}`);

  return (
    <div
      className={`${styles.wrap} ${sizeClass} ${tierClass} ${snap.criticalMinute ? styles.criticalMinute : ""} ${className}`}
      aria-live={isLive ? "polite" : undefined}
      role="timer"
    >
      <div className={styles.ringOuter}>
        <svg className={styles.ringSvg} viewBox="0 0 200 200" aria-hidden>
          <defs>
            <linearGradient id={`${gradId}-on`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#34d399" />
              <stop offset="100%" stopColor="#22d3ee" />
            </linearGradient>
            <linearGradient id={`${gradId}-warn`} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#fbbf24" />
              <stop offset="100%" stopColor="#f97316" />
            </linearGradient>
            <linearGradient id={`${gradId}-danger`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#fb7185" />
              <stop offset="100%" stopColor="#dc2626" />
            </linearGradient>
            <linearGradient id={`${gradId}-over`} x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#9f1239" />
              <stop offset="100%" stopColor="#f43f5e" />
            </linearGradient>
          </defs>
          <circle className={styles.ringTrack} cx="100" cy="100" r={RING_R} />
          <circle
            className={styles.ringProgress}
            cx="100"
            cy="100"
            r={RING_R}
            stroke={
              snap.visualTier === "onTrack" || snap.visualTier === "idle"
                ? `url(#${gradId}-on)`
                : snap.visualTier === "warning"
                  ? `url(#${gradId}-warn)`
                  : snap.visualTier === "danger"
                    ? `url(#${gradId}-danger)`
                    : snap.visualTier === "overdue"
                      ? `url(#${gradId}-over)`
                      : "currentColor"
            }
            strokeDasharray={RING_C}
            strokeDashoffset={strokeOffset}
          />
        </svg>
        <div className={styles.innerGlow} aria-hidden />
        <div className={styles.glassPlate} aria-hidden />
        <div className={styles.center}>
          <p className={`${styles.time} ${displayFlash ? styles.timeTick : ""}`}>{snap.display}</p>
          <p className={styles.status}>{statusLabel}</p>
          {snap.isLive || snap.visualTier === "idle" ? (
            <p className={styles.progressPct}>{snap.progressPct}%</p>
          ) : null}
        </div>
      </div>

      {showTitle && taskTitle ? <p className={styles.taskTitle}>{taskTitle}</p> : null}

      {showMeta && (snap.startedLabel || snap.endsLabel) ? (
        <div className={styles.meta}>
          {snap.startedLabel ? (
            <span>
              {t("tasks.timer.startedAt", { time: snap.startedLabel })}
            </span>
          ) : null}
          {snap.endsLabel ? (
            <span>
              {t("tasks.timer.endsAt", { time: snap.endsLabel })}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export const TaskCountdownRing = memo(TaskCountdownRingInner);
