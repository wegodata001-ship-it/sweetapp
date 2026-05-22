/**
 * סדר עבודה יומי לעובד — עותקי קבוצות (לא משנים תבנית מקורית).
 */

import { prisma } from "@/lib/prisma";
import { prismaAny } from "@/lib/prisma";
import { resolveSingleUserForEmployeeFast } from "@/lib/work-tasks/employee-assignee-cache";
import { queueTaskAssignedBatch, queueTaskAssignedNotification } from "@/lib/work-tasks/notify-async";
import {
  serializeEmployeeTask,
  type SerializedEmployeeTaskGroup,
  type SerializedEmployeeWorkDay,
} from "@/lib/work-tasks/serialize-employee-work";
import { findOrCreateTaskTemplate } from "@/lib/work-tasks/task-template-library";

function parseWorkDate(input: string | undefined): Date {
  const raw = (input ?? "").trim() || new Date().toISOString().slice(0, 10);
  const [y, m, d] = raw.split("-").map((x) => parseInt(x, 10));
  return new Date(Date.UTC(y, m - 1, d));
}

export async function getOrCreateWorkSessionForDate(employeeId: string, workDate: Date) {
  const existing = await prisma.employeeWorkSession.findFirst({
    where: { employeeId, workDate },
    orderBy: { startedAt: "desc" },
  });
  if (existing) return existing;
  return prisma.employeeWorkSession.create({
    data: { employeeId, workDate, status: "ACTIVE" },
  });
}

export async function loadEmployeeWorkDay(
  employeeId: string,
  workDateStr?: string,
): Promise<SerializedEmployeeWorkDay | null> {
  const emp = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { id: true, name: true },
  });
  if (!emp) return null;

  const assignee = await resolveSingleUserForEmployeeFast(employeeId);
  if (!assignee.ok) return null;

  const workDate = parseWorkDate(workDateStr);
  const session = await prisma.employeeWorkSession.findFirst({
    where: { employeeId, workDate },
    orderBy: { startedAt: "desc" },
    select: { id: true },
  });

  const [groups, loose] = await Promise.all([
    prismaAny.employeeTaskGroup.findMany({
      where: { employeeId, workDate },
      orderBy: { orderIndex: "asc" },
      include: {
        tasks: { orderBy: { orderIndex: "asc" } },
      },
    }),
    session
      ? prisma.employeeTask.findMany({
          where: { employeeId, sessionId: session.id, taskGroupId: null },
          orderBy: { orderIndex: "asc" },
        })
      : Promise.resolve([]),
  ]);

  const allTasks = [
    ...groups.flatMap((g: { tasks: unknown[] }) => g.tasks),
    ...loose,
  ] as {
    estimatedMinutes: number;
    status: string;
  }[];

  const completed = allTasks.filter((t) => t.status === "COMPLETED").length;
  const active = allTasks.filter((t) => t.status === "IN_PROGRESS").length;

  return {
    employee_id: emp.id,
    employee_name: emp.name,
    assignee_user_id: assignee.userId,
    work_date: workDate.toISOString().slice(0, 10),
    session_id: session?.id ?? "",
    total_minutes: allTasks.reduce((s, t) => s + (t.estimatedMinutes ?? 0), 0),
    task_count: allTasks.length,
    completed_count: completed,
    active_count: active,
    groups: groups.map(
      (g: {
        id: string;
        title: string;
        color: string | null;
        orderIndex: number;
        sourceWorkTemplateId: string | null;
        sourceWorkflowTemplateId: string | null;
        tasks: Parameters<typeof serializeEmployeeTask>[0][];
      }) => ({
        id: g.id,
        title: g.title,
        color: g.color,
        order_index: g.orderIndex,
        source_work_template_id: g.sourceWorkTemplateId,
        source_workflow_template_id: g.sourceWorkflowTemplateId,
        tasks: g.tasks.map(serializeEmployeeTask),
      }),
    ),
    loose_tasks: loose.map(serializeEmployeeTask),
  };
}

export async function copyWorkTemplateToEmployee(params: {
  employeeId: string;
  workTemplateId: string;
  workDateStr?: string;
  color?: string | null;
}) {
  const assignee = await resolveSingleUserForEmployeeFast(params.employeeId);
  if (!assignee.ok) throw new Error(assignee.error);

  const tpl = await prisma.workTemplate.findUnique({
    where: { id: params.workTemplateId },
    include: {
      tasks: { orderBy: { orderIndex: "asc" }, include: { taskTemplate: true } },
    },
  });
  if (!tpl || tpl.tasks.length === 0) throw new Error("תבנית לא נמצאה או ריקה");

  const workDate = parseWorkDate(params.workDateStr);
  const session = await getOrCreateWorkSessionForDate(params.employeeId, workDate);

  const maxGroup = await prismaAny.employeeTaskGroup.aggregate({
    where: { employeeId: params.employeeId, workDate },
    _max: { orderIndex: true },
  });
  const groupOrder = (maxGroup._max.orderIndex ?? -1) + 1;

  const group = await prismaAny.employeeTaskGroup.create({
    data: {
      employeeId: params.employeeId,
      assignedToUserId: assignee.userId,
      sessionId: session.id,
      workDate,
      title: tpl.title,
      color: params.color ?? null,
      orderIndex: groupOrder,
      sourceWorkTemplateId: tpl.id,
    },
  });

  const created = await prisma.$transaction(
    tpl.tasks.map((line, idx) =>
      prisma.employeeTask.create({
        data: {
          employeeId: params.employeeId,
          assignedToUserId: assignee.userId,
          sessionId: session.id,
          taskGroupId: group.id,
          taskTemplateId: line.taskTemplateId,
          title: line.taskTemplate.title,
          description: line.taskTemplate.description,
          estimatedMinutes: line.taskTemplate.estimatedMinutes,
          orderIndex: line.orderIndex ?? idx,
          status: "PENDING",
        },
      }),
    ),
  );

  queueTaskAssignedBatch(
    created.map((task) => ({
      taskId: task.id,
      employeeId: params.employeeId,
      title: task.title,
    })),
  );

  const serializedGroup: SerializedEmployeeTaskGroup = {
    id: group.id,
    title: group.title,
    color: group.color,
    order_index: group.orderIndex,
    source_work_template_id: group.sourceWorkTemplateId,
    source_workflow_template_id: group.sourceWorkflowTemplateId,
    tasks: created.map(serializeEmployeeTask),
  };

  return { groupId: group.id, count: created.length, group: serializedGroup };
}

export async function copyWorkflowTemplateToEmployee(params: {
  employeeId: string;
  workflowTemplateId: string;
  workDateStr?: string;
  color?: string | null;
}) {
  const assignee = await resolveSingleUserForEmployeeFast(params.employeeId);
  if (!assignee.ok) throw new Error(assignee.error);

  const tpl = await prismaAny.workflowTemplate.findFirst({
    where: { id: params.workflowTemplateId, deletedAt: null },
    include: {
      items: {
        orderBy: { orderIndex: "asc" },
        include: { task: true },
      },
    },
  });
  if (!tpl || tpl.items.length === 0) throw new Error("קבוצת workflow לא נמצאה");

  const workDate = parseWorkDate(params.workDateStr);
  const session = await getOrCreateWorkSessionForDate(params.employeeId, workDate);

  const maxGroup = await prismaAny.employeeTaskGroup.aggregate({
    where: { employeeId: params.employeeId, workDate },
    _max: { orderIndex: true },
  });
  const groupOrder = (maxGroup._max.orderIndex ?? -1) + 1;

  const group = await prismaAny.employeeTaskGroup.create({
    data: {
      employeeId: params.employeeId,
      assignedToUserId: assignee.userId,
      sessionId: session.id,
      workDate,
      title: tpl.title,
      color: params.color ?? tpl.color ?? null,
      orderIndex: groupOrder,
      sourceWorkflowTemplateId: tpl.id,
    },
  });

  const created = await prisma.$transaction(
    tpl.items.map(
      (
        line: {
          orderIndex: number;
          minutesOverride: number | null;
          titleOverride: string | null;
          color: string | null;
          task: {
            title: string;
            description: string | null;
            estimatedMinutes: number;
            color: string | null;
          };
        },
        idx: number,
      ) =>
        prisma.employeeTask.create({
          data: {
            employeeId: params.employeeId,
            assignedToUserId: assignee.userId,
            sessionId: session.id,
            taskGroupId: group.id,
            title: line.titleOverride?.trim() || line.task.title,
            description: line.task.description,
            estimatedMinutes: line.minutesOverride ?? line.task.estimatedMinutes,
            color: line.color ?? line.task.color ?? null,
            orderIndex: line.orderIndex ?? idx,
            status: "PENDING",
          },
        }),
    ),
  );

  queueTaskAssignedBatch(
    created.map((task) => ({
      taskId: task.id,
      employeeId: params.employeeId,
      title: task.title,
    })),
  );

  const serializedGroup: SerializedEmployeeTaskGroup = {
    id: group.id,
    title: group.title,
    color: group.color,
    order_index: group.orderIndex,
    source_work_template_id: group.sourceWorkTemplateId,
    source_workflow_template_id: group.sourceWorkflowTemplateId,
    tasks: created.map(serializeEmployeeTask),
  };

  return { groupId: group.id, count: created.length, group: serializedGroup };
}

export async function createSingleEmployeeTask(params: {
  employeeId: string;
  title: string;
  estimatedMinutes: number;
  description?: string | null;
  materials?: string | null;
  targetDueAt?: string | null;
  taskGroupId?: string | null;
  color?: string | null;
  taskTemplateId?: string | null;
  workDateStr?: string;
}) {
  const assignee = await resolveSingleUserForEmployeeFast(params.employeeId);
  if (!assignee.ok) throw new Error(assignee.error);

  const title = params.title.trim();
  if (!title) throw new Error("חובה שם משימה");

  const workDate = parseWorkDate(params.workDateStr);
  const session = await getOrCreateWorkSessionForDate(params.employeeId, workDate);

  const lib = params.taskTemplateId
    ? { id: params.taskTemplateId, created: false }
    : await findOrCreateTaskTemplate({
        title,
        description: params.description,
        estimatedMinutes: params.estimatedMinutes,
      });

  let orderIndex = 0;
  if (params.taskGroupId) {
    const maxInGroup = await prisma.employeeTask.aggregate({
      where: { taskGroupId: params.taskGroupId },
      _max: { orderIndex: true },
    });
    orderIndex = (maxInGroup._max.orderIndex ?? -1) + 1;
  } else {
    const maxTask = await prisma.employeeTask.aggregate({
      where: { employeeId: params.employeeId, sessionId: session.id, taskGroupId: null },
      _max: { orderIndex: true },
    });
    orderIndex = (maxTask._max.orderIndex ?? -1) + 1;
  }

  const task = await prisma.employeeTask.create({
    data: {
      employeeId: params.employeeId,
      assignedToUserId: assignee.userId,
      sessionId: session.id,
      taskGroupId: params.taskGroupId || null,
      taskTemplateId: lib.id,
      title,
      description: params.description?.trim() || null,
      materials: params.materials?.trim() || null,
      color: params.color ?? null,
      targetDueAt: params.targetDueAt ? new Date(params.targetDueAt) : null,
      estimatedMinutes: Math.min(480, Math.max(0, Math.round(params.estimatedMinutes))),
      orderIndex,
      status: "PENDING",
    },
  });

  queueTaskAssignedNotification({
    taskId: task.id,
    employeeId: params.employeeId,
    title: task.title,
  });

  return serializeEmployeeTask(task);
}

export async function reorderEmployeeTasks(orderedIds: string[]) {
  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.employeeTask.update({ where: { id }, data: { orderIndex: index } }),
    ),
  );
}

export async function reorderEmployeeGroups(orderedGroupIds: string[]) {
  await prisma.$transaction(
    orderedGroupIds.map((id, index) =>
      prismaAny.employeeTaskGroup.update({ where: { id }, data: { orderIndex: index } }),
    ),
  );
}

export async function updateEmployeeTaskManager(
  taskId: string,
  patch: {
    title?: string;
    estimatedMinutes?: number;
    description?: string | null;
    materials?: string | null;
    targetDueAt?: string | null;
    color?: string | null;
  },
) {
  const data: Record<string, unknown> = {};
  if (patch.title !== undefined) data.title = patch.title.trim();
  if (patch.color !== undefined) data.color = patch.color?.trim() || null;
  if (patch.estimatedMinutes !== undefined) {
    data.estimatedMinutes = Math.min(480, Math.max(0, Math.round(patch.estimatedMinutes)));
  }
  if (patch.description !== undefined) data.description = patch.description?.trim() || null;
  if (patch.materials !== undefined) data.materials = patch.materials?.trim() || null;
  if (patch.targetDueAt !== undefined) {
    data.targetDueAt = patch.targetDueAt ? new Date(patch.targetDueAt) : null;
  }
  return prisma.employeeTask.update({ where: { id: taskId }, data });
}

export async function deleteEmployeeTaskManager(taskId: string) {
  await prisma.employeeTask.delete({ where: { id: taskId } });
}

export async function deleteEmployeeTaskGroupManager(groupId: string, actorUserId?: string) {
  const g = await prismaAny.employeeTaskGroup.findUnique({
    where: { id: groupId },
    select: { id: true, title: true, employeeId: true, workDate: true },
  });
  const delTasks = await prisma.employeeTask.deleteMany({ where: { taskGroupId: groupId } });
  await prismaAny.employeeTaskGroup.delete({ where: { id: groupId } });
  console.log("[GROUP DELETED]", {
    groupId,
    title: g?.title,
    employeeId: g?.employeeId,
    workDate: g?.workDate,
    tasksRemoved: delTasks.count,
    actorUserId: actorUserId ?? null,
    at: new Date().toISOString(),
  });
}

export async function updateEmployeeTaskGroupManager(
  groupId: string,
  patch: { title?: string; color?: string | null },
) {
  const data: Record<string, unknown> = {};
  if (patch.title !== undefined) data.title = patch.title.trim();
  if (patch.color !== undefined) data.color = patch.color?.trim() || null;
  return prismaAny.employeeTaskGroup.update({ where: { id: groupId }, data });
}

export async function duplicateEmployeeTaskGroupManager(groupId: string, workDateStr?: string) {
  const src = await prismaAny.employeeTaskGroup.findUnique({
    where: { id: groupId },
    include: { tasks: { orderBy: { orderIndex: "asc" } } },
  });
  if (!src) throw new Error("קבוצה לא נמצאה");

  const workDate = parseWorkDate(workDateStr ?? src.workDate.toISOString().slice(0, 10));
  const session = await getOrCreateWorkSessionForDate(src.employeeId, workDate);
  const assignee = await resolveSingleUserForEmployeeFast(src.employeeId);
  if (!assignee.ok) throw new Error(assignee.error);

  const maxGroup = await prismaAny.employeeTaskGroup.aggregate({
    where: { employeeId: src.employeeId, workDate },
    _max: { orderIndex: true },
  });

  const group = await prismaAny.employeeTaskGroup.create({
    data: {
      employeeId: src.employeeId,
      assignedToUserId: assignee.userId,
      sessionId: session.id,
      workDate,
      title: `${src.title} (עותק)`,
      color: src.color,
      orderIndex: (maxGroup._max.orderIndex ?? -1) + 1,
      sourceWorkTemplateId: src.sourceWorkTemplateId,
      sourceWorkflowTemplateId: src.sourceWorkflowTemplateId,
    },
  });

  await prisma.$transaction(
    src.tasks.map((task: Parameters<typeof serializeEmployeeTask>[0], idx: number) =>
      prisma.employeeTask.create({
        data: {
          employeeId: src.employeeId,
          assignedToUserId: assignee.userId,
          sessionId: session.id,
          taskGroupId: group.id,
          taskTemplateId: task.taskTemplateId,
          title: task.title,
          description: task.description,
          materials: task.materials,
          color: (task as { color?: string | null }).color ?? null,
          estimatedMinutes: task.estimatedMinutes,
          orderIndex: idx,
          status: "PENDING",
        },
      }),
    ),
  );

  return group.id;
}
