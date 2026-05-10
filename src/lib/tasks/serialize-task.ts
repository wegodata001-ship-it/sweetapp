import type { UserRole } from "@prisma/client";
import {
  completionQuality,
  effectiveTaskStatus,
  handlingDurationMs,
  taskDeadlinePassed,
} from "@/lib/tasks/helpers";
import { scheduledStartMs } from "@/lib/tasks/schedule";

export type SerializedEmployeeTask = ReturnType<typeof serializeEmployeeTask>;

export function serializeEmployeeTask(row: {
  id: string;
  assigneeId: string;
  groupId: string | null;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  taskDate: Date;
  startTime: string;
  startedAt: Date | null;
  completedAt: Date | null;
  dueDate?: Date | null;
  employeeNote?: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdById?: string | null;
  assignee: { id: string; fullName: string; email: string; role: UserRole };
}) {
  const effective = effectiveTaskStatus(row);
  const deadlinePassed = taskDeadlinePassed(row);
  const doneQuality = completionQuality(row.completedAt, row.startedAt, row.taskDate, row.startTime);
  const schedMs = scheduledStartMs(row.taskDate, row.startTime);
  const now = Date.now();

  let remainingMs = 0;
  if (row.status !== "completed" && row.status !== "rejected") {
    if (row.status === "pending" && now < schedMs) {
      remainingMs = Math.max(0, schedMs - now);
    }
  }

  const handleMs = handlingDurationMs(row.startedAt, row.completedAt);
  const a = row.assignee;

  return {
    id: row.id,
    assignee_id: row.assigneeId,
    group_id: row.groupId,
    title: row.title,
    description: row.description ?? "",
    priority: row.priority,
    status: row.status,
    effective_status: effective,
    task_date: row.taskDate.toISOString(),
    start_time: row.startTime,
    scheduled_start_ms: schedMs,
    started_at: row.startedAt?.toISOString() ?? null,
    completed_at: row.completedAt?.toISOString() ?? null,
    due_date: row.dueDate ? new Date(row.dueDate).toISOString().slice(0, 10) : null,
    employee_note: row.employeeNote ?? "",
    deadline_passed: deadlinePassed,
    completion_quality: doneQuality,
    remaining_ms: remainingMs,
    handling_duration_ms: handleMs,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    created_by_id: row.createdById ?? null,
    assignee: {
      id: a.id,
      fullName: a.fullName,
      email: a.email,
      role: a.role,
    },
    /** תאימות לאחור ל־UI ישן — שם מלא בתור name */
    employee: {
      id: a.id,
      name: a.fullName,
      role: a.role,
      department: null as string | null,
      email: a.email,
    },
  };
}
