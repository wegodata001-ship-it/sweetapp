/** נוכחות LIVE — online / idle / working */

export const ONLINE_THRESHOLD_SEC = 60;
export const IDLE_NO_TASK_SEC = 10 * 60;

export type WorkPresenceState = "OFFLINE" | "ONLINE" | "IDLE" | "WORKING" | "LATE";

export function isUserOnline(lastSeenAt: Date | null | undefined, now = Date.now()): boolean {
  if (!lastSeenAt) return false;
  return now - lastSeenAt.getTime() < ONLINE_THRESHOLD_SEC * 1000;
}

export function resolvePresenceState(params: {
  lastSeenAt: Date | null;
  activeTaskId: string | null;
  activeTaskStartedAt: Date | null;
  taskStatus?: string | null;
  targetDueAt?: Date | null;
  now?: number;
}): WorkPresenceState {
  const now = params.now ?? Date.now();
  if (!isUserOnline(params.lastSeenAt, now)) return "OFFLINE";

  if (params.activeTaskId && params.taskStatus === "IN_PROGRESS") {
    if (params.targetDueAt && params.targetDueAt.getTime() < now) return "LATE";
    return "WORKING";
  }

  if (params.lastSeenAt && now - params.lastSeenAt.getTime() > IDLE_NO_TASK_SEC * 1000) {
    return "IDLE";
  }

  return "ONLINE";
}

export function formatElapsedMs(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
