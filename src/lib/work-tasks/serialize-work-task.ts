export type SerializedWorkEmployeeTask = ReturnType<typeof serializeWorkEmployeeTask>;

export function serializeWorkEmployeeTask(row: {
  id: string;
  employeeId: string;
  sessionId: string;
  taskTemplateId: string | null;
  title: string;
  description: string | null;
  estimatedMinutes: number;
  startedAt: Date | null;
  completedAt: Date | null;
  status: string;
  delayReason: string | null;
  orderIndex: number;
  createdAt: Date;
}) {
  return {
    id: row.id,
    employee_id: row.employeeId,
    session_id: row.sessionId,
    task_template_id: row.taskTemplateId,
    title: row.title,
    description: row.description,
    estimated_minutes: row.estimatedMinutes,
    started_at: row.startedAt ? row.startedAt.toISOString() : null,
    completed_at: row.completedAt ? row.completedAt.toISOString() : null,
    status: row.status,
    delay_reason: row.delayReason,
    order_index: row.orderIndex,
    created_at: row.createdAt.toISOString(),
  };
}
