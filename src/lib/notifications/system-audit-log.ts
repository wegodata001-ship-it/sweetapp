import { logActivity } from "@/lib/activity-log";

export type NotificationAuditAction =
  | "NOTIFICATION_CREATED"
  | "EMAIL_NOTIFICATION_SENT"
  | "EMAIL_NOTIFICATION_FAILED";

function compactDetail(detail?: Record<string, unknown>): string {
  if (!detail || Object.keys(detail).length === 0) return "";
  const parts: string[] = [];
  for (const [key, value] of Object.entries(detail)) {
    if (value == null || value === "") continue;
    parts.push(`${key}=${String(value)}`);
  }
  return parts.length ? ` ${parts.join(" ")}` : "";
}

/** שומר לוג מערכת ב-ActivityLog — לא שובר זרימה עיקרית */
export async function persistNotificationAudit(
  userId: string,
  action: NotificationAuditAction,
  detail?: Record<string, unknown>,
): Promise<void> {
  if (!userId?.trim()) return;
  await logActivity(userId.trim(), `${action}${compactDetail(detail)}`);
}
