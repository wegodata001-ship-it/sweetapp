import { persistNotificationAudit } from "@/lib/notifications/system-audit-log";

type EmailLogPayload = {
  notificationId?: string | null;
  userId?: string | null;
  recipientUserId?: string | null;
  to?: string;
  email?: string;
  subject?: string;
  type?: string;
  template?: string;
  provider?: string;
  providerResponse?: unknown;
  status?: "SUCCESS" | "FAILED" | "SKIPPED" | "PENDING" | "RETRY";
  reason?: string;
  error?: unknown;
  resendId?: string;
  logId?: string | null;
  attempt?: number;
  step?: string;
  role?: string;
  [key: string]: unknown;
};

function formatEmailLog(payload: EmailLogPayload): string {
  const lines = ["Sending Email..."];
  const to = payload.to ?? payload.email;
  if (to) lines.push(`To: ${to}`);
  if (payload.subject) lines.push(`Subject: ${payload.subject}`);
  if (payload.notificationId) lines.push(`Notification ID: ${payload.notificationId}`);
  const uid = payload.userId ?? payload.recipientUserId;
  if (uid) lines.push(`User ID: ${uid}`);
  if (payload.type) lines.push(`Type: ${payload.type}`);
  if (payload.provider) lines.push(`Provider: ${payload.provider}`);
  if (payload.attempt) lines.push(`Attempt: ${payload.attempt}`);
  if (payload.status === "SUCCESS") {
    lines.push("Result: SUCCESS");
    if (payload.resendId) lines.push(`Provider ID: ${payload.resendId}`);
    if (payload.logId) lines.push(`EmailLog ID: ${payload.logId}`);
  } else if (payload.status === "FAILED" || payload.status === "SKIPPED") {
    lines.push(`Result: ${payload.status}`);
    const reason = payload.reason ?? payload.error;
    if (reason) lines.push(`Reason: ${String(reason)}`);
  } else if (payload.status === "RETRY") {
    lines.push("Result: RETRY");
  } else if (payload.status === "PENDING") {
    lines.push("Result: PENDING");
    if (payload.reason) lines.push(`Reason: ${payload.reason}`);
  }
  if (payload.providerResponse) {
    lines.push(`Provider Response: ${JSON.stringify(payload.providerResponse)}`);
  }
  return lines.join("\n");
}

export function logEmailSending(payload: EmailLogPayload): void {
  console.log(formatEmailLog({ ...payload, status: payload.status ?? "PENDING" }));
}

export function logEmailSent(payload: EmailLogPayload): void {
  console.log(formatEmailLog({ ...payload, status: "SUCCESS" }));
  const userId = payload.userId ?? payload.recipientUserId;
  if (userId) {
    void persistNotificationAudit(userId, "EMAIL_NOTIFICATION_SENT", {
      notificationId: payload.notificationId,
      type: payload.type,
      to: payload.to ?? payload.email,
      logId: payload.logId,
      resendId: payload.resendId,
    });
  }
}

function reasonText(payload: EmailLogPayload): string | undefined {
  if (payload.reason != null) return String(payload.reason);
  if (payload.error != null) return String(payload.error);
  return undefined;
}

export function logEmailFailed(payload: EmailLogPayload): void {
  console.log(formatEmailLog({ ...payload, status: "FAILED", reason: reasonText(payload) }));
  const userId = payload.userId ?? payload.recipientUserId;
  if (userId) {
    void persistNotificationAudit(userId, "EMAIL_NOTIFICATION_FAILED", {
      notificationId: payload.notificationId,
      type: payload.type,
      to: payload.to ?? payload.email,
      reason: reasonText(payload),
      logId: payload.logId,
    });
  }
}

export function logEmailSkipped(payload: EmailLogPayload): void {
  console.log(formatEmailLog({ ...payload, status: "SKIPPED", reason: reasonText(payload) }));
}

export function logEmailRetry(payload: EmailLogPayload): void {
  console.log(formatEmailLog({ ...payload, status: "RETRY" }));
}

export function logEmailError(payload: EmailLogPayload): void {
  console.error(formatEmailLog({ ...payload, status: "FAILED", reason: reasonText(payload) }));
}
