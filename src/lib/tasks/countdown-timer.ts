import { formatTimerMs } from "@/lib/tasks/timer-display";

export type TimerVisualTier = "paused" | "onTrack" | "warning" | "danger" | "overdue" | "idle" | "done";

export type TimerStatusKey =
  | "PAUSED"
  | "RUNNING"
  | "ON_TRACK"
  | "WARNING"
  | "LATE"
  | "OVERDUE"
  | "PENDING"
  | "DONE";

export type CountdownTimerSnapshot = {
  display: string;
  /** אחוז זמן שנותר (0–100) */
  progressPct: number;
  /** 0–1 לטבעת SVG */
  ringProgress: number;
  visualTier: TimerVisualTier;
  statusKey: TimerStatusKey;
  isLive: boolean;
  isOverdue: boolean;
  criticalMinute: boolean;
  startedLabel: string | null;
  endsLabel: string | null;
  elapsedMs: number;
  remainingMs: number;
  estimatedMs: number;
};

function formatClock(iso: string | null, locale: string): string | null {
  if (!iso) return null;
  const bcp47 = locale === "ar" ? "ar-EG" : locale === "en" ? "en-US" : "he-IL";
  return new Date(iso).toLocaleTimeString(bcp47, { hour: "2-digit", minute: "2-digit" });
}

/**
 * טיימר countdown: deadline = startedAt + estimatedMinutes.
 * צבעים לפי אחוז זמן שנותר (לא elapsed).
 */
export function computeCountdownTimer(input: {
  estimatedMinutes: number | null | undefined;
  startedAt: string | null;
  completedAt?: string | null;
  taskStatus: string;
  paused?: boolean;
  nowMs: number;
  locale?: string;
}): CountdownTimerSnapshot {
  const locale = input.locale ?? "he";
  const estMin = Math.max(0, input.estimatedMinutes ?? 0);
  const estimatedMs = Math.round(estMin * 60_000);
  const startedMs = input.startedAt ? new Date(input.startedAt).getTime() : 0;
  const completedMs = input.completedAt ? new Date(input.completedAt).getTime() : null;
  const now = input.nowMs;

  const startedLabel = formatClock(input.startedAt, locale);
  const endsMs = startedMs && estimatedMs > 0 ? startedMs + estimatedMs : 0;
  const endsLabel = endsMs ? formatClock(new Date(endsMs).toISOString(), locale) : null;

  if (input.taskStatus === "COMPLETED") {
    const elapsedMs =
      startedMs && completedMs ? Math.max(0, completedMs - startedMs) : 0;
    return {
      display: formatTimerMs(elapsedMs),
      progressPct: 100,
      ringProgress: 1,
      visualTier: "done",
      statusKey: "DONE",
      isLive: false,
      isOverdue: false,
      criticalMinute: false,
      startedLabel,
      endsLabel,
      elapsedMs,
      remainingMs: 0,
      estimatedMs,
    };
  }

  if (input.paused && input.taskStatus === "IN_PROGRESS") {
    const elapsedMs = startedMs ? Math.max(0, now - startedMs) : 0;
    const remainingMs = Math.max(0, estimatedMs - elapsedMs);
    return {
      display: formatTimerMs(remainingMs),
      progressPct: estimatedMs > 0 ? Math.round((remainingMs / estimatedMs) * 100) : 0,
      ringProgress: estimatedMs > 0 ? remainingMs / estimatedMs : 0,
      visualTier: "paused",
      statusKey: "PAUSED",
      isLive: false,
      isOverdue: false,
      criticalMinute: false,
      startedLabel,
      endsLabel,
      elapsedMs,
      remainingMs,
      estimatedMs,
    };
  }

  if (input.taskStatus === "PENDING" || !startedMs) {
    return {
      display: estimatedMs > 0 ? formatTimerMs(estimatedMs) : "—",
      progressPct: 100,
      ringProgress: 1,
      visualTier: "idle",
      statusKey: "PENDING",
      isLive: false,
      isOverdue: false,
      criticalMinute: false,
      startedLabel: null,
      endsLabel: null,
      elapsedMs: 0,
      remainingMs: estimatedMs,
      estimatedMs,
    };
  }

  const referenceMs = completedMs ?? now;
  const elapsedMs = Math.max(0, referenceMs - startedMs);
  const deadlineMs = startedMs + estimatedMs;
  const isOverdue = estimatedMs > 0 && referenceMs > deadlineMs;
  const remainingMs = isOverdue ? 0 : Math.max(0, deadlineMs - referenceMs);
  const remainingRatio = estimatedMs > 0 ? remainingMs / estimatedMs : 1;
  const progressPct = isOverdue ? 0 : Math.min(100, Math.round(remainingRatio * 100));
  const ringProgress = isOverdue ? 0 : Math.max(0, Math.min(1, remainingRatio));
  const criticalMinute = !isOverdue && remainingMs > 0 && remainingMs < 60_000;

  let visualTier: TimerVisualTier = "onTrack";
  let statusKey: TimerStatusKey = "ON_TRACK";

  if (isOverdue) {
    visualTier = "overdue";
    statusKey = "OVERDUE";
  } else if (remainingRatio >= 0.7) {
    visualTier = "onTrack";
    statusKey = "ON_TRACK";
  } else if (remainingRatio >= 0.3) {
    visualTier = "warning";
    statusKey = "WARNING";
  } else {
    visualTier = "danger";
    statusKey = "LATE";
  }

  if (!completedMs && input.taskStatus === "IN_PROGRESS") {
    statusKey = statusKey === "ON_TRACK" ? "RUNNING" : statusKey;
  }

  const display = isOverdue
    ? `+${formatTimerMs(referenceMs - deadlineMs)}`
    : formatTimerMs(remainingMs);

  return {
    display,
    progressPct,
    ringProgress,
    visualTier,
    statusKey,
    isLive: !completedMs && input.taskStatus === "IN_PROGRESS",
    isOverdue,
    criticalMinute,
    startedLabel,
    endsLabel,
    elapsedMs,
    remainingMs,
    estimatedMs,
  };
}
