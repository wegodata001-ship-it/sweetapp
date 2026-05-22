import { notifyTaskAssigned } from "@/lib/notifications/task-flow";

/** התראות ברקע — לא חוסם save */
export function queueTaskAssignedNotification(params: {
  taskId: string;
  employeeId: string;
  title: string;
}): void {
  void notifyTaskAssigned(params).catch((e) => {
    console.error("[queueTaskAssignedNotification]", e);
  });
}

export function queueTaskAssignedBatch(
  items: { taskId: string; employeeId: string; title: string }[],
): void {
  for (const p of items) queueTaskAssignedNotification(p);
}
