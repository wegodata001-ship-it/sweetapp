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
