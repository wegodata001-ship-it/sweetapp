import { scheduledStartMs } from "@/lib/tasks/schedule";

/** סטטוס תצוגה — באיחור כשממתינה ושעת ההתחלה המתוזמנת כבר עברה */
export type TaskEffectiveStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "overdue"
  | "problem"
  | "rejected";

/** סטטוסים שהעובד יכול לעדכן ב־UI */
export const EMPLOYEE_TASK_STATUS_KEYS = [
  "pending",
  "in_progress",
  "completed",
  "problem",
  "rejected",
] as const;
export type EmployeeTaskStatusKey = (typeof EMPLOYEE_TASK_STATUS_KEYS)[number];

export const WORKER_STATUS_LABELS: Record<EmployeeTaskStatusKey, string> = {
  pending: "ממתינה",
  in_progress: "בטיפול",
  completed: "הושלמה",
  problem: "בעיה",
  rejected: "נדחתה",
};

export function taskDeadlinePassed(row: {
  status: string;
  taskDate: Date;
  startTime: string;
  dueDate?: Date | null;
}): boolean {
  if (row.status === "completed" || row.status === "rejected") return false;
  if (row.dueDate) {
    const end = new Date(row.dueDate);
    end.setHours(23, 59, 59, 999);
    if (Date.now() > end.getTime()) return true;
  }
  const sched = scheduledStartMs(row.taskDate, row.startTime);
  return row.status === "pending" && Date.now() > sched;
}

export function effectiveTaskStatus(row: {
  status: string;
  taskDate: Date;
  startTime: string;
  dueDate?: Date | null;
}): TaskEffectiveStatus {
  if (row.status === "completed") return "completed";
  if (row.status === "problem") return "problem";
  if (row.status === "rejected") return "rejected";
  if (row.status === "in_progress") return "in_progress";
  if (taskDeadlinePassed(row)) return "overdue";
  return "pending";
}

/** התחלה בזמן לעומת השעה המתוזמנת */
export function completionQuality(
  completedAt: Date | null,
  startedAt: Date | null,
  taskDate: Date,
  startTime: string,
): "on_time" | "late" | null {
  if (!completedAt || !startedAt) return null;
  const sched = scheduledStartMs(taskDate, startTime);
  return startedAt.getTime() <= sched ? "on_time" : "late";
}

/** תומך גם בערכים ישנים מהמסד (medium, low) */
export const PRIORITY_KEYS = ["normal", "low", "medium", "high", "urgent"] as const;
export type TaskPriorityKey = (typeof PRIORITY_KEYS)[number];

/** יצירת משימה על ידי מנהל — רגילה / גבוהה / דחופה בלבד */
export const MANAGER_TASK_PRIORITIES = ["normal", "high", "urgent"] as const;
export type ManagerTaskPriority = (typeof MANAGER_TASK_PRIORITIES)[number];

export const PRIORITY_LABELS: Record<string, string> = {
  normal: "רגילה",
  low: "נמוכה",
  medium: "בינונית",
  high: "גבוהה",
  urgent: "דחופה",
};

export function priorityLabel(k: string): string {
  return PRIORITY_LABELS[k] ?? k;
}

export const STATUS_LABELS: Record<TaskEffectiveStatus, string> = {
  pending: "ממתינה",
  in_progress: "בטיפול",
  completed: "הושלמה",
  overdue: "באיחור",
  problem: "בעיה",
  rejected: "נדחתה",
};

/** משך טיפול במילישניות */
export function handlingDurationMs(startedAt: Date | null, completedAt: Date | null): number | null {
  if (!startedAt || !completedAt) return null;
  const ms = completedAt.getTime() - startedAt.getTime();
  return ms >= 0 ? ms : null;
}

/** רמת אזהרה לטיימר לפי אחוז התקדמות מול זמן יעד */
export type TimerTier = "green" | "yellow" | "orange" | "red" | "none";

/**
 * חישוב התקדמות טיימר עבור משימה שמתבצעת.
 *
 * חוקים:
 *  - אין estimatedMinutes / לא startedAt → tier=none
 *  - elapsed ≤ 70% מהזמן → green
 *  - 70%–100% → yellow (מתקרב לסיום)
 *  - 100%–130% → orange (איחור קל)
 *  - >130% → red (איחור משמעותי)
 */
export function timerProgress(input: {
  estimatedMinutes: number | null | undefined;
  startedAt: Date | string | null | undefined;
  completedAt?: Date | string | null;
  nowMs?: number;
}): {
  tier: TimerTier;
  elapsedMs: number;
  estimatedMs: number;
  remainingMs: number;
  /** אחוז מהיעד (0–∞, 1.0 = 100%) */
  ratio: number;
  isOver: boolean;
} {
  const estMin = input.estimatedMinutes ?? 0;
  const estimatedMs = Math.max(0, Math.round(estMin * 60_000));
  const now = input.nowMs ?? Date.now();
  const startedMs = input.startedAt
    ? typeof input.startedAt === "string"
      ? new Date(input.startedAt).getTime()
      : input.startedAt.getTime()
    : 0;
  const completedMs = input.completedAt
    ? typeof input.completedAt === "string"
      ? new Date(input.completedAt).getTime()
      : input.completedAt.getTime()
    : null;
  if (!startedMs || estimatedMs <= 0) {
    return { tier: "none", elapsedMs: 0, estimatedMs, remainingMs: 0, ratio: 0, isOver: false };
  }
  const referenceMs = completedMs ?? now;
  const elapsedMs = Math.max(0, referenceMs - startedMs);
  const ratio = elapsedMs / estimatedMs;
  const remainingMs = Math.max(0, estimatedMs - elapsedMs);
  const isOver = elapsedMs > estimatedMs;

  let tier: TimerTier = "green";
  if (ratio >= 1.3) tier = "red";
  else if (ratio >= 1) tier = "orange";
  else if (ratio >= 0.7) tier = "yellow";

  return { tier, elapsedMs, estimatedMs, remainingMs, ratio, isOver };
}

/**
 * האם משימה הסתיימה באיחור (actual > estimated). אם אין estimatedMinutes — false.
 */
export function isTaskLate(
  estimatedMinutes: number | null | undefined,
  actualMinutes: number | null | undefined,
): boolean {
  if (!estimatedMinutes || estimatedMinutes <= 0) return false;
  if (actualMinutes == null) return false;
  return actualMinutes > estimatedMinutes;
}

/**
 * חישוב actual minutes משעת התחלה ושעת סיום.
 */
export function computeActualMinutes(startedAt: Date | null, completedAt: Date | null): number | null {
  if (!startedAt || !completedAt) return null;
  const ms = completedAt.getTime() - startedAt.getTime();
  if (ms <= 0) return 0;
  return Math.max(0, Math.round(ms / 60_000));
}
