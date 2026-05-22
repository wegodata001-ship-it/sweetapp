/**
 * Server-side task group (WorkflowTemplate) lifecycle.
 * Duplicate / delete must run here — never clone or cascade from the client.
 */

import { prismaAny } from "@/lib/prisma";

const TEMPLATE_DETAIL_INCLUDE = {
  items: {
    include: {
      task: {
        select: {
          id: true,
          title: true,
          description: true,
          color: true,
          estimatedMinutes: true,
          requireLateReason: true,
          archivedAt: true,
        },
      },
    },
    orderBy: { orderIndex: "asc" as const },
  },
} as const;

export class TaskGroupServiceError extends Error {
  constructor(
    message: string,
    readonly code: "NOT_FOUND" | "FORBIDDEN" | "VALIDATION",
  ) {
    super(message);
    this.name = "TaskGroupServiceError";
  }
}

const COPY_SUFFIX = " (עותק)";

function appendCopySuffix(title: string): string {
  const base = title.trim();
  if (base.endsWith(COPY_SUFFIX)) return `${base}${COPY_SUFFIX}`;
  return `${base}${COPY_SUFFIX}`;
}

/**
 * Creates a new template with the same items (library refs + overrides).
 * Does NOT copy runs, timers, ACTIVE state, or notifications.
 */
export async function duplicateTaskGroup(params: {
  sourceTemplateId: string;
  createdById: string;
  titleOverride?: string;
}) {
  const source = await prismaAny.workflowTemplate.findFirst({
    where: { id: params.sourceTemplateId, deletedAt: null },
    include: { items: { orderBy: { orderIndex: "asc" } } },
  });
  if (!source) {
    throw new TaskGroupServiceError("קבוצת משימות לא נמצאה", "NOT_FOUND");
  }

  const title = (params.titleOverride ?? appendCopySuffix(source.title)).trim();
  if (!title) {
    throw new TaskGroupServiceError("שם קבוצה לא תקין", "VALIDATION");
  }

  const items = (source.items as {
    taskId: string;
    orderIndex: number;
    minutesOverride: number | null;
    titleOverride: string | null;
  }[]).map((it, idx) => ({
    taskId: it.taskId,
    orderIndex: idx,
    minutesOverride: it.minutesOverride ?? null,
    titleOverride: it.titleOverride ?? null,
  }));

  const created = await prismaAny.workflowTemplate.create({
    data: {
      title,
      description: source.description,
      color: source.color,
      createdById: params.createdById,
      items: items.length
        ? {
            create: items,
          }
        : undefined,
    },
    include: TEMPLATE_DETAIL_INCLUDE,
  });

  return created;
}

/**
 * Soft-deletes a task group, related runs, and workflow-linked notifications.
 * Does not touch generic ActivityLog audit rows.
 */
export async function deleteTaskGroup(templateId: string) {
  const template = await prismaAny.workflowTemplate.findFirst({
    where: { id: templateId, deletedAt: null },
    select: { id: true, title: true },
  });
  if (!template) {
    throw new TaskGroupServiceError("קבוצת משימות לא נמצאה", "NOT_FOUND");
  }

  const now = new Date();

  const runs = await prismaAny.workflowRun.findMany({
    where: { templateId, deletedAt: null },
    select: { id: true },
  });
  const runIds = runs.map((r: { id: string }) => r.id);

  if (runIds.length > 0) {
    const urlClauses = runIds.flatMap((id: string) => [
      { actionUrl: { contains: id } },
      { actionUrl: { contains: `/api/workflows/runs/${id}` } },
      { actionUrl: { contains: `/workflows/runs/${id}` } },
    ]);
    await prismaAny.notification.deleteMany({
      where: {
        OR: [...urlClauses, { actionUrl: { contains: templateId } }],
      },
    });

    await prismaAny.workflowRun.updateMany({
      where: { templateId, deletedAt: null },
      data: {
        deletedAt: now,
        status: "ABORTED",
        abortedAt: now,
      },
    });
  } else {
    await prismaAny.notification.deleteMany({
      where: { actionUrl: { contains: templateId } },
    });
  }

  await prismaAny.workflowTemplate.update({
    where: { id: templateId },
    data: {
      deletedAt: now,
      archivedAt: now,
    },
  });

  return { templateId, runsSoftDeleted: runIds.length };
}
