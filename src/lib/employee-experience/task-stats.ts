import { computeActualMinutes } from "@/lib/tasks/helpers";
import type { SerializedWorkEmployeeTask } from "@/lib/work-tasks/serialize-work-task";

export type EmployeeTaskDayStats = {
  total: number;
  completed: number;
  pending: number;
  inProgress: number;
  lateWhileActive: number;
  progressPct: number;
  avgCompletedMinutes: number | null;
};

export function computeEmployeeTaskDayStats(
  tasks: SerializedWorkEmployeeTask[],
): EmployeeTaskDayStats {
  let completed = 0;
  let pending = 0;
  let inProgress = 0;
  let lateWhileActive = 0;
  const durations: number[] = [];

  for (const t of tasks) {
    if (t.status === "COMPLETED") {
      completed += 1;
      const mins = computeActualMinutes(
        t.started_at ? new Date(t.started_at) : null,
        t.completed_at ? new Date(t.completed_at) : null,
      );
      if (mins != null) durations.push(mins);
    } else if (t.status === "IN_PROGRESS") {
      inProgress += 1;
    } else if (t.status === "PENDING") {
      pending += 1;
    }
  }

  const total = tasks.length;
  const progressPct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const avgCompletedMinutes =
    durations.length > 0
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : null;

  return {
    total,
    completed,
    pending,
    inProgress,
    lateWhileActive,
    progressPct,
    avgCompletedMinutes,
  };
}

export type MotivationKind = "doneMany" | "onTrack" | "almostDone" | "start" | "allDone";

export function pickMotivationKind(stats: EmployeeTaskDayStats): MotivationKind {
  if (stats.total === 0) return "allDone";
  if (stats.completed === stats.total && stats.total > 0) return "allDone";
  if (stats.completed >= 4) return "doneMany";
  if (stats.inProgress > 0 && stats.lateWhileActive === 0) return "onTrack";
  if (stats.completed > 0 && stats.pending <= 1) return "almostDone";
  return "start";
}
