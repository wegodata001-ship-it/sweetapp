import { timerProgress, type TimerTier } from "@/lib/tasks/helpers";

export function formatTimerMs(ms: number): string {
  const clamped = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(clamped / 3600);
  const m = Math.floor((clamped % 3600) / 60);
  const s = clamped % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  if (h > 0) return `${String(h).padStart(2, "0")}:${mm}:${ss}`;
  return `${mm}:${ss}`;
}

export type ProgressBarTone = "blue" | "yellow" | "red" | "neutral";

export function tierToBarTone(tier: TimerTier, isOver: boolean): ProgressBarTone {
  if (tier === "none") return "neutral";
  if (isOver || tier === "red" || tier === "orange") return "red";
  if (tier === "yellow") return "yellow";
  return "blue";
}

export function getTimerSnapshot(input: {
  estimatedMinutes: number | null | undefined;
  startedAt: string | null;
  completedAt?: string | null;
  nowMs: number;
}) {
  const tp = timerProgress({
    estimatedMinutes: input.estimatedMinutes,
    startedAt: input.startedAt,
    completedAt: input.completedAt ?? null,
    nowMs: input.nowMs,
  });

  const progressPct =
    tp.estimatedMs > 0 ? Math.min(100, Math.round(tp.ratio * 100)) : 0;
  const barTone = tierToBarTone(tp.tier, tp.isOver);

  const mainDisplay = !input.startedAt
    ? null
    : tp.tier === "none"
      ? formatTimerMs(tp.elapsedMs)
      : tp.isOver
        ? formatTimerMs(tp.elapsedMs - tp.estimatedMs)
        : formatTimerMs(tp.remainingMs);

  return { tp, progressPct, barTone, mainDisplay };
}
