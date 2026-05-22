export type SerializedEmployeeTask = {
  id: string;
  employee_id: string;
  session_id: string;
  task_group_id: string | null;
  task_template_id: string | null;
  title: string;
  description: string | null;
  materials: string | null;
  target_due_at: string | null;
  estimated_minutes: number;
  started_at: string | null;
  completed_at: string | null;
  status: string;
  delay_reason: string | null;
  color: string | null;
  order_index: number;
  created_at: string;
};

export type SerializedEmployeeTaskGroup = {
  id: string;
  title: string;
  color: string | null;
  order_index: number;
  source_work_template_id: string | null;
  source_workflow_template_id: string | null;
  tasks: SerializedEmployeeTask[];
};

export type SerializedEmployeeWorkDay = {
  employee_id: string;
  employee_name: string;
  assignee_user_id: string;
  work_date: string;
  session_id: string;
  total_minutes: number;
  task_count: number;
  completed_count: number;
  active_count: number;
  groups: SerializedEmployeeTaskGroup[];
  loose_tasks: SerializedEmployeeTask[];
};

function toIso(d: Date | null | undefined): string | null {
  if (!d) return null;
  return d instanceof Date ? d.toISOString() : String(d);
}

export function serializeEmployeeTask(row: {
  id: string;
  employeeId: string;
  sessionId: string;
  taskGroupId: string | null;
  taskTemplateId: string | null;
  title: string;
  description: string | null;
  materials: string | null;
  targetDueAt: Date | null;
  estimatedMinutes: number;
  startedAt: Date | null;
  completedAt: Date | null;
  status: string;
  delayReason: string | null;
  color?: string | null;
  orderIndex: number;
  createdAt: Date;
}): SerializedEmployeeTask {
  return {
    id: row.id,
    employee_id: row.employeeId,
    session_id: row.sessionId,
    task_group_id: row.taskGroupId,
    task_template_id: row.taskTemplateId,
    title: row.title,
    description: row.description,
    materials: row.materials,
    target_due_at: toIso(row.targetDueAt),
    estimated_minutes: row.estimatedMinutes,
    started_at: toIso(row.startedAt),
    completed_at: toIso(row.completedAt),
    status: row.status,
    delay_reason: row.delayReason,
    color: row.color ?? null,
    order_index: row.orderIndex,
    created_at: row.createdAt.toISOString(),
  };
}
