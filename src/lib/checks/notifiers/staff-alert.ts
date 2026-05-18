import type { CheckNotificationKind } from "@/lib/checks/types";
import { notifyAdminRecipients, toneToColor } from "@/lib/notifications/dispatch";
import type { CheckNotifier } from "@/lib/checks/notifiers/types";
import { NotificationType } from "@prisma/client";

function checkKindToType(kind: CheckNotificationKind): NotificationType {
  switch (kind) {
    case "bounced":
      return NotificationType.CHECK_BOUNCED;
    case "deposited":
      return NotificationType.CHECK_DEPOSITED;
    default:
      return NotificationType.CHECK_DUE;
  }
}

function checkKindTone(kind: CheckNotificationKind): "SUCCESS" | "WARNING" | "DANGER" | "INFO" {
  if (kind === "deposited") return "SUCCESS";
  if (kind === "bounced" || kind === "overdue") return "DANGER";
  if (kind === "due_today") return "WARNING";
  return "INFO";
}

/**
 * התראות צ'קים — רק למנהלים (ADMIN), לא לעובדים.
 */
export const staffAlertNotifier: CheckNotifier = {
  channel: "staff_alert",
  isReady() {
    return true;
  },
  async send(payload) {
    if (payload.recipientUserIds.length === 0) return false;
    try {
      const type = checkKindToType(payload.kind);
      const tone = checkKindTone(payload.kind);
      await notifyAdminRecipients(payload.recipientUserIds, {
        type,
        title: payload.title,
        message: payload.body,
        color: toneToColor(tone),
        subjectUserId: null,
        metadata: { source: "check", kind: payload.kind, checkId: payload.checkId },
        actionUrl: null,
      });
      return true;
    } catch {
      return false;
    }
  },
};
