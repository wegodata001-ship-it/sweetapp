import type { SessionJwtPayload } from "@/lib/auth/jwt";
import { strictUserId } from "@/lib/auth/strict-user-isolation";
import { canManageAllTasks } from "@/lib/tasks/task-access";
import {
  logTaskAccessAllowed,
  logTaskAccessBlocked,
} from "@/lib/work-tasks/task-security-log";

export async function assertEmployeeOwnsWorkTask(
  session: SessionJwtPayload,
  task: { id?: string; employeeId: string; assignedToUserId?: string | null },
  action: "start" | "complete" | "view" = "view",
): Promise<{ ok: true } | { ok: false; status: number; error: string; code?: string }> {
  const userId = strictUserId(session);
  const taskId = task.id ?? "unknown";

  if (canManageAllTasks(session)) {
    logTaskAccessAllowed({
      action,
      taskId,
      userId,
      manager: true,
      assignedToUserId: task.assignedToUserId,
    });
    return { ok: true };
  }

  if (!task.assignedToUserId || task.assignedToUserId !== userId) {
    logTaskAccessBlocked({
      action,
      taskId,
      userId,
      assignedToUserId: task.assignedToUserId ?? null,
      reason: !task.assignedToUserId ? "missing_assignee" : "assignee_mismatch",
    });
    return {
      ok: false,
      status: 403,
      error: "לא ניתן לבצע פעולה על משימה שלא שייכת לך",
      code: "NOT_YOUR_TASK",
    };
  }

  logTaskAccessAllowed({
    action,
    taskId,
    userId,
    assignedToUserId: task.assignedToUserId,
  });
  return { ok: true };
}
