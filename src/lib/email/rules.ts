import type { UserRole } from "@prisma/client";
import {
  emailImportanceMeetsThreshold,
  resolveEmailImportance,
  type EmailImportance,
} from "@/lib/email/importance";
import {
  getUserEmailPreferences,
  type EmailPreferenceSnapshot,
} from "@/lib/email/preferences";
import { isQuietHours } from "@/lib/email/quiet-hours";
import {
  isEmployeeNotificationOwned,
  isManagerNotificationRelevant,
} from "@/lib/email/manager-relevance";
import type { NotificationEmailPayload } from "@/lib/email/notification-bridge";
import type { NotificationPriorityLevel } from "@/lib/notifications/priority";
import { isManagerRole } from "@/lib/notifications/me-inbox";

export type ShouldSendEmailInput = {
  role: UserRole;
  notificationType: string;
  priority?: NotificationPriorityLevel | string | null;
  roleTarget: "ADMIN" | "EMPLOYEE" | "BOTH";
  recipientUserId: string;
  metadata?: Record<string, unknown> | null;
  prefs: EmailPreferenceSnapshot;
  emailImportance?: EmailImportance;
  now?: Date;
};

export type ShouldSendEmailResult = {
  send: boolean;
  reason: string;
  importance: EmailImportance;
};

function prefsAllowImportance(
  prefs: EmailPreferenceSnapshot,
  importance: EmailImportance,
  notificationType: string,
): boolean {
  if (prefs.emailMode === "muted") return false;
  if (prefs.emailMode === "critical_only") {
    return importance === "CRITICAL" || importance === "HIGH";
  }
  if (prefs.emailMode === "daily_digest") {
    return emailImportanceMeetsThreshold(importance, "NORMAL");
  }
  if (!prefs.emailNotifyAll) return false;
  if (!emailImportanceMeetsThreshold(importance, "NORMAL")) return false;

  switch (notificationType) {
    case "TASK_ASSIGNED":
    case "TASK_COMPLETED":
    case "TASK_OVERDUE":
    case "TASK_LATE":
      return prefs.emailNotifyTasks;
    case "SHIFT_LATE":
    case "CLOCK_IN_LATE":
      return prefs.emailNotifyLate;
    case "NEW_UPDATE":
      return prefs.emailNotifyUpdates;
    default:
      return true;
  }
}

/**
 * מנוע החלטות — האם לשלוח מייל להתראה זו.
 */
export async function shouldSendEmailForNotification(
  input: ShouldSendEmailInput,
  payload?: NotificationEmailPayload,
): Promise<ShouldSendEmailResult> {
  const importance =
    input.emailImportance ??
    resolveEmailImportance({
      type: input.notificationType,
      priority: input.priority,
      roleTarget: input.roleTarget,
      metadata: input.metadata,
    });

  if (!emailImportanceMeetsThreshold(importance, "NORMAL")) {
    return { send: false, reason: "importance_below_normal", importance };
  }

  if (!prefsAllowImportance(input.prefs, importance, input.notificationType)) {
    return { send: false, reason: "user_preferences", importance };
  }

  if (input.prefs.emailQuietHours && isQuietHours(input.now) && importance !== "CRITICAL") {
    return { send: false, reason: "quiet_hours", importance };
  }

  if (payload) {
    if (payload.recipientUserId !== input.recipientUserId) {
      return { send: false, reason: "recipient_mismatch", importance };
    }

    const manager = isManagerRole(input.role);
    if (manager || input.roleTarget === "ADMIN") {
      const relevant = await isManagerNotificationRelevant(input.recipientUserId, payload);
      if (!relevant) {
        return { send: false, reason: "manager_not_relevant", importance };
      }
    } else {
      const owned = isEmployeeNotificationOwned(input.recipientUserId, payload);
      if (!owned) {
        return { send: false, reason: "employee_not_owner", importance };
      }
    }
  }

  return { send: true, reason: "ok", importance };
}

/** טעינת העדפות + החלטה בקריאה אחת */
export async function evaluateNotificationEmail(
  userId: string,
  role: UserRole,
  payload: NotificationEmailPayload,
  priority?: NotificationPriorityLevel | string | null,
): Promise<ShouldSendEmailResult> {
  const prefs = await getUserEmailPreferences(userId);
  return shouldSendEmailForNotification(
    {
      role,
      notificationType: payload.type,
      priority,
      roleTarget: payload.roleTarget,
      recipientUserId: userId,
      metadata: (payload.metadata ?? {}) as Record<string, unknown>,
      prefs,
    },
    payload,
  );
}
