import type { ReactNode } from "react";
import type { NotificationPriorityLevel } from "@/lib/notifications/priority";

export type EmailTone = "SUCCESS" | "WARNING" | "ERROR" | "INFO" | "TASK";

export type SystemEmailTemplate =
  | "test-simple"
  | "task-assigned"
  | "task-completed"
  | "shift-late"
  | "check-deposit"
  | "future-order"
  | "new-update"
  | "system-alert";

export type EmailSendResult = {
  ok: boolean;
  error?: string;
  logId?: string | null;
  resendId?: string;
};

export type SendSystemEmailInput = {
  to: string;
  subject: string;
  template: SystemEmailTemplate;
  data: Record<string, unknown>;
  priority?: NotificationPriorityLevel;
  userId?: string;
  notificationId?: string;
  /** סוג התראה (NotificationType) ללוגים */
  type?: string;
  /** שליחה מחדש מממשק ניהול — ללא dedupe */
  skipDedupe?: boolean;
};

export type BaseEmailProps = {
  previewText: string;
  headline: string;
  tone: EmailTone;
  appUrl: string;
  ctaLabel?: string;
  ctaUrl?: string;
  children?: ReactNode;
};

export const EMAIL_TONE_COLORS: Record<EmailTone, { accent: string; bg: string }> = {
  SUCCESS: { accent: "#16a34a", bg: "#f0fdf4" },
  WARNING: { accent: "#ea580c", bg: "#fff7ed" },
  ERROR: { accent: "#dc2626", bg: "#fef2f2" },
  INFO: { accent: "#2563eb", bg: "#eff6ff" },
  TASK: { accent: "#7c3aed", bg: "#f5f3ff" },
};
