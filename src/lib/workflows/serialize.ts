/**
 * Serialization helpers for the Workflow models (task library, templates,
 * live runs). The shape is snake_case to match the rest of the codebase.
 *
 * Timer math is intentionally derived from `started_at` (ISO string) on the
 * client. The server only stores absolute timestamps, never countdown state.
 */

/**
 * Workflow enums duplicated as string literal unions so the codebase compiles
 * even before `prisma generate` finishes producing the typed enum exports
 * (Windows + OneDrive locks the engine binary on this machine).
 *
 * Keep these in sync with the Prisma schema.
 */
export type WorkflowRunStatus = "IN_PROGRESS" | "COMPLETED" | "ABORTED";
export type WorkflowItemStatus = "PENDING" | "ACTIVE" | "COMPLETED" | "SKIPPED";

export type WorkflowTaskDto = {
  id: string;
  title: string;
  description: string | null;
  estimated_minutes: number;
  require_late_reason: boolean;
  color: string | null;
  sort_order: number;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  /** How many templates currently use this library task. */
  template_usage_count?: number;
};

export type WorkflowTemplateItemDto = {
  id: string;
  template_id: string;
  task_id: string;
  task_title: string;
  /** Effective title: titleOverride ?? task.title */
  display_title: string;
  task_color: string | null;
  task_description: string | null;
  order_index: number;
  /** Effective minutes shown to the user: minutesOverride ?? task.estimatedMinutes */
  effective_minutes: number;
  minutes_override: number | null;
  title_override: string | null;
  require_late_reason: boolean;
  archived: boolean;
};

export type WorkflowTemplateSummaryDto = {
  id: string;
  title: string;
  description: string | null;
  color: string | null;
  item_count: number;
  total_minutes: number;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type WorkflowTemplateDetailDto = WorkflowTemplateSummaryDto & {
  items: WorkflowTemplateItemDto[];
};

export type WorkflowRunItemDto = {
  id: string;
  run_id: string;
  source_task_id: string | null;
  title: string;
  description: string | null;
  color: string | null;
  estimated_minutes: number;
  require_late_reason: boolean;
  order_index: number;
  status: WorkflowItemStatus;
  started_at: string | null;
  completed_at: string | null;
  actual_minutes: number | null;
  is_late: boolean;
  late_reason: string | null;
};

export type WorkflowRunSummaryDto = {
  id: string;
  template_id: string | null;
  template_title: string | null;
  assignee_id: string;
  assignee_name: string;
  title: string;
  status: WorkflowRunStatus;
  started_at: string;
  completed_at: string | null;
  aborted_at: string | null;
  current_index: number;
  item_count: number;
  completed_count: number;
  late_count: number;
  total_estimated_minutes: number;
  notes: string | null;
};

export type WorkflowRunDetailDto = WorkflowRunSummaryDto & {
  items: WorkflowRunItemDto[];
};

type WorkflowTaskRow = {
  id: string;
  title: string;
  description: string | null;
  estimatedMinutes: number;
  requireLateReason: boolean;
  color: string | null;
  sortOrder: number;
  archivedAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  _count?: { templateItems?: number };
};

function toIso(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  if (typeof d === "string") return d;
  return d.toISOString();
}

export function serializeWorkflowTask(row: WorkflowTaskRow): WorkflowTaskDto {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? null,
    estimated_minutes: row.estimatedMinutes,
    require_late_reason: row.requireLateReason,
    color: row.color ?? null,
    sort_order: row.sortOrder,
    archived_at: toIso(row.archivedAt),
    created_at: toIso(row.createdAt) ?? new Date(0).toISOString(),
    updated_at: toIso(row.updatedAt) ?? new Date(0).toISOString(),
    template_usage_count: row._count?.templateItems ?? undefined,
  };
}

type WorkflowTemplateItemRow = {
  id: string;
  templateId: string;
  taskId: string;
  orderIndex: number;
  minutesOverride: number | null;
  titleOverride: string | null;
  task: {
    id: string;
    title: string;
    description: string | null;
    estimatedMinutes: number;
    color: string | null;
    requireLateReason: boolean;
    archivedAt: Date | string | null;
  };
};

export function serializeWorkflowTemplateItem(
  row: WorkflowTemplateItemRow,
): WorkflowTemplateItemDto {
  const minutes = row.minutesOverride ?? row.task.estimatedMinutes;
  return {
    id: row.id,
    template_id: row.templateId,
    task_id: row.taskId,
    task_title: row.task.title,
    display_title: row.titleOverride?.trim() || row.task.title,
    task_color: row.task.color ?? null,
    task_description: row.task.description ?? null,
    order_index: row.orderIndex,
    effective_minutes: minutes,
    minutes_override: row.minutesOverride ?? null,
    title_override: row.titleOverride ?? null,
    require_late_reason: row.task.requireLateReason,
    archived: Boolean(row.task.archivedAt),
  };
}

type WorkflowTemplateRow = {
  id: string;
  title: string;
  description: string | null;
  color: string | null;
  archivedAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  items?: WorkflowTemplateItemRow[];
  _count?: { items?: number };
};

function templateTotals(items: WorkflowTemplateItemRow[] | undefined): {
  count: number;
  minutes: number;
} {
  if (!items) return { count: 0, minutes: 0 };
  let minutes = 0;
  for (const it of items) {
    minutes += it.minutesOverride ?? it.task.estimatedMinutes;
  }
  return { count: items.length, minutes };
}

export function serializeWorkflowTemplateSummary(
  row: WorkflowTemplateRow,
): WorkflowTemplateSummaryDto {
  const totals = templateTotals(row.items);
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? null,
    color: row.color ?? null,
    item_count: row._count?.items ?? totals.count,
    total_minutes: totals.minutes,
    archived_at: toIso(row.archivedAt),
    created_at: toIso(row.createdAt) ?? new Date(0).toISOString(),
    updated_at: toIso(row.updatedAt) ?? new Date(0).toISOString(),
  };
}

export function serializeWorkflowTemplateDetail(
  row: WorkflowTemplateRow,
): WorkflowTemplateDetailDto {
  const items = (row.items ?? [])
    .slice()
    .sort((a, b) => a.orderIndex - b.orderIndex);
  return {
    ...serializeWorkflowTemplateSummary({ ...row, items }),
    items: items.map(serializeWorkflowTemplateItem),
  };
}

type WorkflowRunItemRow = {
  id: string;
  runId: string;
  sourceTaskId: string | null;
  title: string;
  description: string | null;
  color: string | null;
  estimatedMinutes: number;
  requireLateReason: boolean;
  orderIndex: number;
  status: WorkflowItemStatus;
  startedAt: Date | string | null;
  completedAt: Date | string | null;
  actualMinutes: number | null;
  isLate: boolean;
  lateReason: string | null;
};

export function serializeWorkflowRunItem(row: WorkflowRunItemRow): WorkflowRunItemDto {
  return {
    id: row.id,
    run_id: row.runId,
    source_task_id: row.sourceTaskId ?? null,
    title: row.title,
    description: row.description ?? null,
    color: row.color ?? null,
    estimated_minutes: row.estimatedMinutes,
    require_late_reason: row.requireLateReason,
    order_index: row.orderIndex,
    status: row.status,
    started_at: toIso(row.startedAt),
    completed_at: toIso(row.completedAt),
    actual_minutes: row.actualMinutes ?? null,
    is_late: row.isLate,
    late_reason: row.lateReason ?? null,
  };
}

type WorkflowRunRow = {
  id: string;
  templateId: string | null;
  template?: { id: string; title: string } | null;
  assigneeId: string;
  assignee?: { id: string; fullName: string } | null;
  title: string;
  status: WorkflowRunStatus;
  startedAt: Date | string;
  completedAt: Date | string | null;
  abortedAt: Date | string | null;
  currentIndex: number;
  notes: string | null;
  items?: WorkflowRunItemRow[];
};

function runTotals(items: WorkflowRunItemRow[] | undefined): {
  count: number;
  completed: number;
  late: number;
  minutes: number;
} {
  if (!items) return { count: 0, completed: 0, late: 0, minutes: 0 };
  let completed = 0;
  let late = 0;
  let minutes = 0;
  for (const it of items) {
    minutes += it.estimatedMinutes;
    if (it.status === "COMPLETED") completed += 1;
    if (it.isLate) late += 1;
  }
  return { count: items.length, completed, late, minutes };
}

export function serializeWorkflowRunSummary(row: WorkflowRunRow): WorkflowRunSummaryDto {
  const totals = runTotals(row.items);
  return {
    id: row.id,
    template_id: row.templateId ?? null,
    template_title: row.template?.title ?? null,
    assignee_id: row.assigneeId,
    assignee_name: row.assignee?.fullName ?? "",
    title: row.title,
    status: row.status,
    started_at: toIso(row.startedAt) ?? new Date(0).toISOString(),
    completed_at: toIso(row.completedAt),
    aborted_at: toIso(row.abortedAt),
    current_index: row.currentIndex,
    item_count: totals.count,
    completed_count: totals.completed,
    late_count: totals.late,
    total_estimated_minutes: totals.minutes,
    notes: row.notes ?? null,
  };
}

export function serializeWorkflowRunDetail(row: WorkflowRunRow): WorkflowRunDetailDto {
  const items = (row.items ?? [])
    .slice()
    .sort((a, b) => a.orderIndex - b.orderIndex);
  return {
    ...serializeWorkflowRunSummary({ ...row, items }),
    items: items.map(serializeWorkflowRunItem),
  };
}
