import {
  completionQuality,
  effectiveTaskStatus,
  handlingDurationMs,
} from "@/lib/tasks/helpers";

export type SerializedEmployeeTask = ReturnType<typeof serializeEmployeeTask>;

export function serializeEmployeeTask(row: {
  id: string;
  title: string | null;
  description: string;
  priority: string;
  status: string;
  dueAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  createdById?: string | null;
  employee: { id: string; name: string; role: string | null; department: string | null };
}) {
  const effective = effectiveTaskStatus(row);
  const doneQuality = completionQuality(row.completedAt, row.dueAt);
  const dueMs = new Date(row.dueAt).getTime();
  const remainingMs = row.status === "completed" ? 0 : Math.max(0, dueMs - Date.now());
  const handleMs = handlingDurationMs(row.startedAt, row.completedAt);

  return {
    id: row.id,
    title: row.title,
    description: row.description,
    priority: row.priority,
    status: row.status,
    effective_status: effective,
    due_at: row.dueAt.toISOString(),
    started_at: row.startedAt?.toISOString() ?? null,
    completed_at: row.completedAt?.toISOString() ?? null,
    completion_quality: doneQuality,
    remaining_ms: remainingMs,
    handling_duration_ms: handleMs,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    created_by_id: row.createdById ?? null,
    employee: {
      id: row.employee.id,
      name: row.employee.name,
      role: row.employee.role,
      department: row.employee.department,
    },
  };
}
