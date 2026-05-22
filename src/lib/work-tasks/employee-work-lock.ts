import type {
  SerializedEmployeeTask,
  SerializedEmployeeWorkDay,
} from "@/lib/work-tasks/serialize-employee-work";

export type TaskLockState = {
  locked: boolean;
  isNext: boolean;
  reason?: "PREVIOUS_INCOMPLETE";
};

/** סדר גלובלי: קבוצות → משימות בקבוצה → משימות חופשיות */
export function getGlobalOrderedTasks(day: SerializedEmployeeWorkDay): SerializedEmployeeTask[] {
  const out: SerializedEmployeeTask[] = [];
  const groups = [...day.groups].sort((a, b) => a.order_index - b.order_index);
  for (const g of groups) {
    const tasks = [...g.tasks].sort((a, b) => a.order_index - b.order_index);
    out.push(...tasks);
  }
  const loose = [...day.loose_tasks].sort((a, b) => a.order_index - b.order_index);
  out.push(...loose);
  return out;
}

/** נעילה בתוך רצף (קבוצה או רשימת loose) */
export function computeSequenceLocks(
  tasks: SerializedEmployeeTask[],
  canManage: boolean,
): Map<string, TaskLockState> {
  const map = new Map<string, TaskLockState>();
  if (canManage) {
    for (const t of tasks) {
      map.set(t.id, { locked: false, isNext: false });
    }
    return map;
  }

  const sorted = [...tasks].sort((a, b) => a.order_index - b.order_index);
  let foundNext = false;
  for (const t of sorted) {
    if (t.status === "COMPLETED") {
      map.set(t.id, { locked: false, isNext: false });
      continue;
    }
    if (!foundNext) {
      map.set(t.id, { locked: false, isNext: true });
      foundNext = true;
    } else {
      map.set(t.id, { locked: true, isNext: false, reason: "PREVIOUS_INCOMPLETE" });
    }
  }
  return map;
}

/** מפת נעילות לכל המשימות ביום (עובד: רק הבא בתור בכל רצף) */
export function computeDayTaskLocks(
  day: SerializedEmployeeWorkDay,
  canManage: boolean,
): Map<string, TaskLockState> {
  const merged = new Map<string, TaskLockState>();
  for (const g of day.groups) {
    const m = computeSequenceLocks(g.tasks, canManage);
    m.forEach((v, k) => merged.set(k, v));
  }
  const loose = computeSequenceLocks(day.loose_tasks, canManage);
  loose.forEach((v, k) => merged.set(k, v));
  return merged;
}

export function getLockForTask(
  day: SerializedEmployeeWorkDay,
  taskId: string,
  canManage: boolean,
): TaskLockState {
  const locks = computeDayTaskLocks(day, canManage);
  return locks.get(taskId) ?? { locked: !canManage, isNext: false, reason: "PREVIOUS_INCOMPLETE" };
}

/** בדיקת שרת לפני start — עובד בלבד */
export async function assertEmployeeCanStartTask(params: {
  taskId: string;
  taskGroupId: string | null;
  orderIndex: number;
  employeeId: string;
  sessionId: string;
  status: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (params.status === "COMPLETED") {
    return { ok: false, error: "משימה כבר הושלמה" };
  }

  const priorWhere = params.taskGroupId
    ? {
        taskGroupId: params.taskGroupId,
        employeeId: params.employeeId,
        orderIndex: { lt: params.orderIndex },
        status: { not: "COMPLETED" },
      }
    : {
        taskGroupId: null,
        sessionId: params.sessionId,
        employeeId: params.employeeId,
        orderIndex: { lt: params.orderIndex },
        status: { not: "COMPLETED" },
      };

  const { prisma } = await import("@/lib/prisma");
  const blocker = await prisma.employeeTask.findFirst({
    where: priorWhere,
    orderBy: { orderIndex: "desc" },
    select: { title: true },
  });
  if (blocker) {
    return { ok: false, error: "יש להשלים משימות קודמות קודם" };
  }
  return { ok: true };
}

export function groupProgress(tasks: SerializedEmployeeTask[]) {
  const total = tasks.length;
  const done = tasks.filter((t) => t.status === "COMPLETED").length;
  const minutes = tasks.reduce((s, t) => s + (t.estimated_minutes ?? 0), 0);
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return { total, done, minutes, pct };
}
