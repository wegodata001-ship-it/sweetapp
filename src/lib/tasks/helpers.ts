/** סטטוס תצוגה — באיחור מחושב לפי dueAt כשלא הושלם */
export type TaskEffectiveStatus = "pending" | "in_progress" | "completed" | "overdue";

export function effectiveTaskStatus(row: { status: string; dueAt: Date }): TaskEffectiveStatus {
  if (row.status === "completed") return "completed";
  if (new Date(row.dueAt).getTime() < Date.now()) return "overdue";
  if (row.status === "in_progress") return "in_progress";
  return "pending";
}

/** האם הסימון "הושלם בזמן" — יחסית ליעד */
export function completionQuality(
  completedAt: Date | null,
  dueAt: Date,
): "on_time" | "late" | null {
  if (!completedAt) return null;
  return completedAt.getTime() <= new Date(dueAt).getTime() ? "on_time" : "late";
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
};

/** משך טיפול במילישניות */
export function handlingDurationMs(startedAt: Date | null, completedAt: Date | null): number | null {
  if (!startedAt || !completedAt) return null;
  const ms = completedAt.getTime() - startedAt.getTime();
  return ms >= 0 ? ms : null;
}
