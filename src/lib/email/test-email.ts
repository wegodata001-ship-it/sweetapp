import { getEmailConfig } from "@/lib/email/config";
import type { SendSystemEmailInput } from "@/lib/email/types";
import type { SystemEmailTemplate } from "@/lib/email/types";

export type EmailTestType =
  | "SIMPLE"
  | "TASK_ASSIGNED"
  | "TASK_COMPLETED"
  | "SHIFT_LATE"
  | "NEW_UPDATE";

export function buildTestEmailPayload(
  type: EmailTestType,
  recipient: string,
): SendSystemEmailInput {
  const { appUrl } = getEmailConfig();
  const entity = `test-${Date.now()}`;

  switch (type) {
    case "SIMPLE":
      return {
        to: recipient,
        subject: "🚀 WEGO ERP Test Email",
        template: "test-simple",
        type: "EMAIL_TEST_SIMPLE",
        skipDedupe: true,
        data: {
          appUrl,
          message:
            "מייל בדיקה מ-WEGO BUSINESS ERP — RTL, עיצוב navy/gold, וכפתור כניסה למערכת.",
        },
      };
    case "TASK_ASSIGNED":
      return {
        to: recipient,
        subject: "🆕 נוספה לך משימה חדשה",
        template: "task-assigned",
        type: "TASK_ASSIGNED",
        skipDedupe: true,
        data: {
          appUrl,
          entityKey: "taskId",
          entityValue: entity,
          taskTitle: "משימת בדיקה — אריזת מוצרים",
          managerName: "מנהל בדיקה",
          deadline: "היום, 18:00",
          priority: "גבוהה",
          actionUrl: `${appUrl}/employee/tasks`,
        },
      };
    case "TASK_COMPLETED":
      return {
        to: recipient,
        subject: "✅ העובד השלים משימה",
        template: "task-completed",
        type: "TASK_COMPLETED",
        skipDedupe: true,
        data: {
          appUrl,
          entityKey: "taskId",
          entityValue: entity,
          employeeName: "עובד בדיקה",
          taskTitle: "משימת בדיקה — אריזת מוצרים",
          completedAt: new Date().toLocaleString("he-IL"),
          durationMinutes: "12 דקות",
          actionUrl: `${appUrl}/admin/tasks`,
        },
      };
    case "SHIFT_LATE":
      return {
        to: recipient,
        subject: "⚠️ עובד מאחר למשמרת",
        template: "shift-late",
        type: "SHIFT_LATE",
        skipDedupe: true,
        data: {
          appUrl,
          entityKey: "workDate",
          entityValue: new Date().toISOString().slice(0, 10),
          audience: "manager",
          employeeName: "עובד בדיקה",
          lateMinutes: "18",
          workDate: new Date().toLocaleDateString("he-IL"),
          actionUrl: `${appUrl}/admin/staff`,
        },
      };
    case "NEW_UPDATE":
      return {
        to: recipient,
        subject: "📢 נוסף עדכון מערכת חדש",
        template: "new-update",
        type: "NEW_UPDATE",
        skipDedupe: true,
        data: {
          appUrl,
          entityKey: "broadcastId",
          entityValue: entity,
          title: "עדכון הנהלה — בדיקה",
          body: "זהו מייל בדיקה לסוג NEW_UPDATE.\nהמערכת פועלת כראוי.",
          actionUrl: `${appUrl}/me/dashboard?update=1`,
        },
      };
    default:
      return buildTestEmailPayload("SIMPLE", recipient);
  }
}

export function notificationTypeToTemplate(type: string): SystemEmailTemplate | null {
  switch (type) {
    case "TASK_ASSIGNED":
      return "task-assigned";
    case "TASK_COMPLETED":
      return "task-completed";
    case "SHIFT_LATE":
      return "shift-late";
    case "NEW_UPDATE":
      return "new-update";
    default:
      return null;
  }
}
