/**
 * פעולות ניהול — איפוס יום, מחיקות מרובות, ניקוי מאגר, עצירת טיימרים.
 */

import { prisma } from "@/lib/prisma";
import { prismaAny } from "@/lib/prisma";
import { resolveSingleUserForEmployeeFast } from "@/lib/work-tasks/employee-assignee-cache";

function parseWorkDate(input: string | undefined): Date {
  const raw = (input ?? "").trim() || new Date().toISOString().slice(0, 10);
  const [y, m, d] = raw.split("-").map((x) => parseInt(x, 10));
  return new Date(Date.UTC(y, m - 1, d));
}

function audit(tag: string, payload: Record<string, unknown>) {
  console.log(tag, { ...payload, at: new Date().toISOString() });
}

export async function deleteAllGroupsForEmployeeDay(params: {
  employeeId: string;
  workDateStr: string;
  actorUserId: string;
}) {
  const workDate = parseWorkDate(params.workDateStr);
  const groups = await prismaAny.employeeTaskGroup.findMany({
    where: { employeeId: params.employeeId, workDate },
    select: { id: true },
  });
  const groupIds = groups.map((g: { id: string }) => g.id);

  if (groupIds.length > 0) {
    await prisma.employeeTask.deleteMany({ where: { taskGroupId: { in: groupIds } } });
    await prismaAny.employeeTaskGroup.deleteMany({ where: { id: { in: groupIds } } });
  }

  audit("[GROUP DELETED]", {
    scope: "all_groups_day",
    employeeId: params.employeeId,
    workDate: params.workDateStr,
    groupsRemoved: groupIds.length,
    actorUserId: params.actorUserId,
  });

  return { groupsRemoved: groupIds.length };
}

export async function stopActiveTimersForEmployeeDay(params: {
  employeeId: string;
  workDateStr: string;
  actorUserId: string;
}) {
  const workDate = parseWorkDate(params.workDateStr);
  const [sessions, groups] = await Promise.all([
    prisma.employeeWorkSession.findMany({
      where: { employeeId: params.employeeId, workDate },
      select: { id: true },
    }),
    prismaAny.employeeTaskGroup.findMany({
      where: { employeeId: params.employeeId, workDate },
      select: { id: true },
    }),
  ]);
  const sessionIds = sessions.map((s) => s.id);
  const groupIds = groups.map((g: { id: string }) => g.id);

  const or: Array<{ taskGroupId?: { in: string[] } | null; sessionId?: { in: string[] } }> = [];
  if (groupIds.length) or.push({ taskGroupId: { in: groupIds } });
  if (sessionIds.length) or.push({ sessionId: { in: sessionIds }, taskGroupId: null });

  const result =
    or.length > 0
      ? await prisma.employeeTask.updateMany({
          where: { employeeId: params.employeeId, status: "IN_PROGRESS", OR: or },
          data: { status: "PENDING", startedAt: null },
        })
      : { count: 0 };

  audit("[TIMERS STOPPED]", {
    employeeId: params.employeeId,
    workDate: params.workDateStr,
    tasksStopped: result.count,
    actorUserId: params.actorUserId,
  });

  return { tasksStopped: result.count };
}

export async function resetEmployeeWorkDay(params: {
  employeeId: string;
  workDateStr: string;
  actorUserId: string;
}) {
  const workDate = parseWorkDate(params.workDateStr);
  const assignee = await resolveSingleUserForEmployeeFast(params.employeeId);

  const { groupsRemoved } = await deleteAllGroupsForEmployeeDay({
    employeeId: params.employeeId,
    workDateStr: params.workDateStr,
    actorUserId: params.actorUserId,
  });

  const sessions = await prisma.employeeWorkSession.findMany({
    where: { employeeId: params.employeeId, workDate },
    select: { id: true },
  });
  const sessionIds = sessions.map((s) => s.id);

  let looseTasksRemoved = 0;
  if (sessionIds.length > 0) {
    const del = await prisma.employeeTask.deleteMany({
      where: { employeeId: params.employeeId, sessionId: { in: sessionIds }, taskGroupId: null },
    });
    looseTasksRemoved = del.count;
    await prisma.employeeWorkSession.updateMany({
      where: { id: { in: sessionIds } },
      data: { status: "ENDED", endedAt: new Date() },
    });
  }

  let runsAborted = 0;
  if (assignee.ok) {
    const runs = await prisma.workflowRun.updateMany({
      where: {
        assigneeId: assignee.userId,
        status: "IN_PROGRESS",
        deletedAt: null,
      },
      data: { status: "ABORTED", abortedAt: new Date() },
    });
    runsAborted = runs.count;
  }

  audit("[WORKDAY RESET]", {
    employeeId: params.employeeId,
    workDate: params.workDateStr,
    groupsRemoved,
    looseTasksRemoved,
    runsAborted,
    actorUserId: params.actorUserId,
  });

  return { groupsRemoved, looseTasksRemoved, runsAborted };
}

/** מחיקה רכה של תבניות מאגר שלא בשימוש */
export async function cleanUnusedTaskLibrary(params: { actorUserId: string }) {
  const [fromTasks, fromTpl] = await Promise.all([
    prisma.employeeTask.findMany({
      where: { taskTemplateId: { not: null } },
      select: { taskTemplateId: true },
      distinct: ["taskTemplateId"],
    }),
    prisma.workTemplateTask.findMany({
      select: { taskTemplateId: true },
      distinct: ["taskTemplateId"],
    }),
  ]);

  const used = new Set<string>();
  for (const r of fromTasks) {
    if (r.taskTemplateId) used.add(r.taskTemplateId);
  }
  for (const r of fromTpl) used.add(r.taskTemplateId);

  const usedList = [...used];
  const result = await prisma.taskTemplate.updateMany({
    where: {
      isActive: true,
      ...(usedList.length > 0 ? { id: { notIn: usedList } } : {}),
    },
    data: { isActive: false },
  });

  audit("[TASK_LIBRARY_CLEANED]", {
    deactivated: result.count,
    keptInUse: usedList.length,
    actorUserId: params.actorUserId,
  });

  return { deactivated: result.count, keptInUse: usedList.length };
}
