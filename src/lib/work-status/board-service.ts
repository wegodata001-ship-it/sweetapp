import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { formatElapsedMs, resolvePresenceState, type WorkPresenceState } from "@/lib/work-status/presence";

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

async function buildTimeline(userId: string, employeeId: string | null): Promise<WorkStatusTimelineEvent[]> {
  if (!employeeId) return [];
  const since = todayUtc();
  const tasks = await prisma.employeeTask.findMany({
    where: {
      employeeId,
      OR: [{ startedAt: { gte: since } }, { completedAt: { gte: since } }],
    },
    orderBy: [{ startedAt: "asc" }, { completedAt: "asc" }],
    take: 12,
    select: { title: true, startedAt: true, completedAt: true, status: true },
  });
  const events: { t: number; label: string }[] = [];
  for (const t of tasks) {
    if (t.startedAt) {
      events.push({
        t: t.startedAt.getTime(),
        label: `התחיל: ${t.title}`,
      });
    }
    if (t.completedAt) {
      events.push({
        t: t.completedAt.getTime(),
        label: `סיים: ${t.title}`,
      });
    }
  }
  return events
    .sort((a, b) => a.t - b.t)
    .slice(-8)
    .map((e) => ({
      at: new Date(e.t).toISOString(),
      label: e.label,
    }));
}

async function stepProgress(taskId: string, employeeId: string, groupId: string | null) {
  if (!groupId) return { index: 1, total: 1 };
  const tasks = await prisma.employeeTask.findMany({
    where: { taskGroupId: groupId, employeeId },
    orderBy: { orderIndex: "asc" },
    select: { id: true },
  });
  const idx = tasks.findIndex((t) => t.id === taskId);
  return { index: idx >= 0 ? idx + 1 : 1, total: tasks.length || 1 };
}

export async function loadWorkStatusBoard(): Promise<WorkStatusBoardRow[]> {
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

  const now = Date.now();
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
      const started = task.startedAt ?? u.activeTaskStartedAt;
      const elapsedMs = started ? now - started.getTime() : 0;
      const prog = await stepProgress(task.id, task.employeeId, task.taskGroupId);
      active_task = {
        id: task.id,
        title: task.title,
        status: task.status,
        color: task.color,
        estimated_minutes: task.estimatedMinutes,
        elapsed: formatElapsedMs(elapsedMs),
        started_at: started?.toISOString() ?? null,
        group_title: task.taskGroup?.title ?? null,
        step_index: prog.index,
        step_total: prog.total,
        description: task.description,
        materials: task.materials,
      };
    }

    const timeline = await buildTimeline(u.id, u.employeeId);

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
  if (u.employeeId && !task) {
    const next = await prisma.employeeTask.findFirst({
      where: { employeeId: u.employeeId, status: "PENDING" },
      orderBy: { orderIndex: "asc" },
      select: { id: true, title: true },
    });
    if (next) next_task = next;
  }

  return {
    user_id: u.id,
    name: u.fullName,
    employee_id: u.employeeId,
    presence,
    active_task: task,
    next_task,
  };
}
