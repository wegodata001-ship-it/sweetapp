import { persistNotificationAudit } from "@/lib/notifications/system-audit-log";

/** לוגים אחידים לשרשרת ההתראות — QA ודיבוג */
export function logNotificationCreated(payload: Record<string, unknown>): void {
  console.log("[NOTIFICATION CREATED]", payload);
  const recipientUserId =
    typeof payload.recipientUserId === "string" ? payload.recipientUserId : null;
  if (recipientUserId) {
    void persistNotificationAudit(recipientUserId, "NOTIFICATION_CREATED", {
      notificationId: payload.id,
      type: payload.type,
      roleTarget: payload.roleTarget,
      emailImportance: payload.emailImportance,
    });
  }
}

export function logNotificationRead(payload: Record<string, unknown>): void {
  console.log("[NOTIFICATION READ]", payload);
}

export function logNotificationFetch(payload: Record<string, unknown>): void {
  console.log("[NOTIFICATION FETCH]", payload);
}

export function logNotificationDeduped(payload: Record<string, unknown>): void {
  console.log("[NOTIFICATION DEDUPED]", payload);
}
