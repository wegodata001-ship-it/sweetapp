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
  delayedAt?: Date | null;
  lateReason?: string | null;
  activeWorkMs?: number;
  segmentStartedAt?: Date | null;
  orderIndex: number;
  createdAt: Date;
  targetDueAt?: Date | null;
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
    delayed_at: row.delayedAt ? row.delayedAt.toISOString() : null,
    late_reason: row.lateReason ?? null,
    active_work_ms: row.activeWorkMs ?? 0,
    segment_started_at: row.segmentStartedAt ? row.segmentStartedAt.toISOString() : null,
    order_index: row.orderIndex,
    created_at: row.createdAt.toISOString(),
    target_due_at: row.targetDueAt ? row.targetDueAt.toISOString() : null,
  };
}
