import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { formatElapsedMs, resolvePresenceState, type WorkPresenceState } from "@/lib/work-status/presence";
import { activeWorkMs } from "@/lib/work-tasks/task-timing";

export type WorkStatusTimelineEvent = {
  at: string;
  label: string;
};

export type WorkStatusBoardRow = {
  user_id: string;
  employee_id: string | null;
  name: string;
  role: string;
  presence: WorkPresenceState;
  last_seen_at: string | null;
  active_task: null | {
    id: string;
    title: string;
    status: string;
    color: string | null;
    estimated_minutes: number;
    elapsed: string;
    started_at: string | null;
    active_work_ms: number;
    group_title: string | null;
    step_index: number;
    step_total: number;
    description: string | null;
    materials: string | null;
  };
  timeline: WorkStatusTimelineEvent[];
};

function todayUtc(): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function timelineFromTasks(
  tasks: Array<{ title: string; startedAt: Date | null; completedAt: Date | null }>,
): WorkStatusTimelineEvent[] {
  const events: { t: number; label: string }[] = [];
  for (const task of tasks) {
    if (task.startedAt) {
      events.push({ t: task.startedAt.getTime(), label: `התחיל: ${task.title}` });
    }
    if (task.completedAt) {
      events.push({ t: task.completedAt.getTime(), label: `סיים: ${task.title}` });
    }
  }
  return events
    .sort((a, b) => a.t - b.t)
    .slice(-8)
    .map((event) => ({
      at: new Date(event.t).toISOString(),
      label: event.label,
    }));
}

export type WorkBoardQueryTimings = {
  userMs: number;
  timelineMs: number;
  groupMs: number;
};

export async function loadWorkStatusBoard(
  timings?: WorkBoardQueryTimings,
): Promise<WorkStatusBoardRow[]> {
  const since = todayUtc();
  const userStarted = performance.now();
  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      role: { in: [UserRole.EMPLOYEE, UserRole.ADMIN, UserRole.SUPER_ADMIN] },
      employeeId: { not: null },
    },
    orderBy: { fullName: "asc" },
    select: {
      id: true,
      fullName: true,
      role: true,
      employeeId: true,
      lastSeenAt: true,
      activeTaskId: true,
      activeTaskStartedAt: true,
      activeTask: {
        select: {
          id: true,
          title: true,
          status: true,
          color: true,
          estimatedMinutes: true,
          startedAt: true,
          activeWorkMs: true,
          segmentStartedAt: true,
          delayReason: true,
          lateReason: true,
          targetDueAt: true,
          description: true,
          materials: true,
          taskGroupId: true,
          employeeId: true,
          taskGroup: { select: { title: true } },
        },
      },
    },
  });
  if (timings) timings.userMs = Math.round(performance.now() - userStarted);

  const now = Date.now();
  const employeeIds = users
    .map((user) => user.employeeId)
    .filter((id): id is string => Boolean(id));
  const progressKeys = users.flatMap((user) => {
    const task = user.activeTask;
    if (!task || task.status !== "IN_PROGRESS" || !task.taskGroupId) return [];
    return [{ taskGroupId: task.taskGroupId, employeeId: task.employeeId }];
  });

  const [timelineTasks, groupTasks] = await Promise.all([
    (async () => {
      const started = performance.now();
      const rows =
        employeeIds.length === 0
          ? []
          : await prisma.employeeTask.findMany({
              where: {
                employeeId: { in: employeeIds },
                OR: [{ startedAt: { gte: since } }, { completedAt: { gte: since } }],
              },
              orderBy: [{ startedAt: "asc" }, { completedAt: "asc" }],
              select: { employeeId: true, title: true, startedAt: true, completedAt: true },
            });
      if (timings) timings.timelineMs = Math.round(performance.now() - started);
      return rows;
    })(),
    (async () => {
      const started = performance.now();
      const rows =
        progressKeys.length === 0
          ? []
          : await prisma.employeeTask.findMany({
              where: { OR: progressKeys },
              orderBy: { orderIndex: "asc" },
              select: { id: true, taskGroupId: true, employeeId: true },
            });
      if (timings) timings.groupMs = Math.round(performance.now() - started);
      return rows;
    })(),
  ]);

  const timelineByEmployee = new Map<string, typeof timelineTasks>();
  for (const task of timelineTasks) {
    const list = timelineByEmployee.get(task.employeeId) ?? [];
    list.push(task);
    timelineByEmployee.set(task.employeeId, list);
  }
  for (const list of timelineByEmployee.values()) {
    list.sort((a, b) => {
      const aStart = a.startedAt?.getTime() ?? Number.POSITIVE_INFINITY;
      const bStart = b.startedAt?.getTime() ?? Number.POSITIVE_INFINITY;
      if (aStart !== bStart) return aStart - bStart;
      const aEnd = a.completedAt?.getTime() ?? Number.POSITIVE_INFINITY;
      const bEnd = b.completedAt?.getTime() ?? Number.POSITIVE_INFINITY;
      return aEnd - bEnd;
    });
    list.splice(12);
  }

  const stepsByGroup = new Map<string, Array<{ id: string }>>();
  for (const task of groupTasks) {
    const key = `${task.employeeId}:${task.taskGroupId ?? ""}`;
    const list = stepsByGroup.get(key) ?? [];
    list.push(task);
    stepsByGroup.set(key, list);
  }

  const rows: WorkStatusBoardRow[] = [];

  for (const u of users) {
    const task = u.activeTask;
    const presence = resolvePresenceState({
      lastSeenAt: u.lastSeenAt,
      activeTaskId: u.activeTaskId,
      activeTaskStartedAt: u.activeTaskStartedAt,
      taskStatus: task?.status,
      targetDueAt: task?.targetDueAt,
      now,
    });

    let active_task: WorkStatusBoardRow["active_task"] = null;
    if (task && task.status === "IN_PROGRESS") {
      const elapsedMs = activeWorkMs({
        activeWorkMs: task.activeWorkMs,
        segmentStartedAt: task.segmentStartedAt ?? task.startedAt ?? u.activeTaskStartedAt,
        status: task.status,
        nowMs: now,
      });
      const steps = task.taskGroupId
        ? (stepsByGroup.get(`${task.employeeId}:${task.taskGroupId}`) ?? [])
        : [];
      const stepIndex = steps.findIndex((row) => row.id === task.id);
      const prog = task.taskGroupId
        ? { index: stepIndex >= 0 ? stepIndex + 1 : 1, total: steps.length || 1 }
        : { index: 1, total: 1 };
      active_task = {
        id: task.id,
        title: task.title,
        status: task.status,
        color: task.color,
        estimated_minutes: task.estimatedMinutes,
        elapsed: formatElapsedMs(elapsedMs),
        started_at: (task.segmentStartedAt ?? task.startedAt)?.toISOString() ?? null,
        active_work_ms: task.activeWorkMs,
        group_title: task.taskGroup?.title ?? null,
        step_index: prog.index,
        step_total: prog.total,
        description: task.description,
        materials: task.materials,
      };
    }

    const timeline = timelineFromTasks(timelineByEmployee.get(u.employeeId ?? "") ?? []);

    rows.push({
      user_id: u.id,
      employee_id: u.employeeId,
      name: u.fullName,
      role: u.role,
      presence,
      last_seen_at: u.lastSeenAt?.toISOString() ?? null,
      active_task,
      timeline,
    });
  }

  return rows.sort((a, b) => {
    const order: Record<WorkPresenceState, number> = {
      WORKING: 0,
      LATE: 1,
      IDLE: 2,
      ONLINE: 3,
      OFFLINE: 4,
    };
    return order[a.presence] - order[b.presence] || a.name.localeCompare(b.name, "he");
  });
}

export async function loadWorkStatusMe(userId: string) {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      fullName: true,
      employeeId: true,
      lastSeenAt: true,
      activeTaskId: true,
      activeTaskStartedAt: true,
      activeTask: {
        include: {
          taskGroup: { select: { title: true, color: true } },
        },
      },
    },
  });

  if (!u) return null;

  const task = u.activeTask;
  const presence = resolvePresenceState({
    lastSeenAt: u.lastSeenAt,
    activeTaskId: u.activeTaskId,
    activeTaskStartedAt: u.activeTaskStartedAt,
    taskStatus: task?.status,
    targetDueAt: task?.targetDueAt,
  });

  let next_task: { id: string; title: string } | null = null;
  let delayed_tasks: Array<{ id: string; title: string; delayReason: string | null }> = [];
  if (u.employeeId) {
    delayed_tasks = await prisma.employeeTask.findMany({
      where: { employeeId: u.employeeId, status: "DELAYED" },
      orderBy: { orderIndex: "asc" },
      select: { id: true, title: true, delayReason: true },
    });
    if (!task || task.status !== "IN_PROGRESS") {
      const next = await prisma.employeeTask.findFirst({
        where: { employeeId: u.employeeId, status: "PENDING" },
        orderBy: { orderIndex: "asc" },
        select: { id: true, title: true },
      });
      if (next) next_task = next;
    }
  }

  return {
    user_id: u.id,
    name: u.fullName,
    employee_id: u.employeeId,
    presence,
    active_task: task && task.status === "IN_PROGRESS" ? task : null,
    next_task,
    delayed_tasks,
  };
}
