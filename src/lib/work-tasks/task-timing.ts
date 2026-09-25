export const TASK_BLOCK_REASONS = ["MISSING_MATERIALS", "MACHINE_BUSY", "NO_AVAILABLE_SPACE"] as const;
export type TaskBlockReason = (typeof TASK_BLOCK_REASONS)[number];

export function isTaskBlockReason(value: string | null | undefined): value is TaskBlockReason {
  return TASK_BLOCK_REASONS.includes(value as TaskBlockReason);
}

/** Always HH:MM:SS with Western digits. */
export function formatClockHms(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

export function activeWorkMs(input: {
  activeWorkMs: number;
  segmentStartedAt: Date | string | null;
  status: string;
  nowMs: number;
}): number {
  let ms = Math.max(0, input.activeWorkMs);
  if (input.status === "IN_PROGRESS" && input.segmentStartedAt) {
    const start = new Date(input.segmentStartedAt).getTime();
    if (Number.isFinite(start)) ms += Math.max(0, input.nowMs - start);
  }
  return ms;
}

export function isWorkLate(activeMs: number, estimatedMinutes: number): boolean {
  if (estimatedMinutes <= 0) return false;
  return activeMs > estimatedMinutes * 60_000;
}
