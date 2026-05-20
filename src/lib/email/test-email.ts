import { getEmailConfig } from "@/lib/email/config";
import type { SendSystemEmailInput } from "@/lib/email/types";
import type { SystemEmailTemplate } from "@/lib/email/types";

export type EmailTestType =
  | "SIMPLE"
  | "OCR_WORDS"
  | "TASK_ASSIGNED"
  | "TASK_COMPLETED"
  | "SHIFT_LATE"
  | "NEW_UPDATE";

/** מילים לבדיקת OCR / Google Vision — חשבונית עבאסי (צפוי) */
const OCR_VERIFY_WORDS_BODY = `בדיקת OCR — Google Vision (layout-position)

ספק צפוי: עבאסי שיווק בע"מ
מספר חשבונית: 57655
תאריך: 21/04/2026
סה"כ לתשלום: 1723.35

10 מילים לדוגמה (text, x, y) — אם רואים עברית תקינה ולא rruwn / ono7N:
1. "עבאסי" x=420 y=85
2. "שיווק" x=360 y=85
3. "בע\"מ" x=300 y=85
4. "חשבונית" x=480 y=120
5. "מס" x=440 y=120
6. "57655" x=200 y=145
7. "תאריך" x=450 y=160
8. "21/04/2026" x=320 y=160
9. "סה\"כ" x=180 y=520
10. "1723.35" x=120 y=520

provider: google_vision | parseSource: layout-position
אין ג'יבריש: rruwn, ono7N, n+¬rnn — אמור להיעלם עם Vision API key.`;

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
    case "OCR_WORDS":
      return {
        to: recipient,
        subject: "🔍 WEGO — מילים לבדיקת OCR (Google Vision)",
        template: "test-simple",
        type: "EMAIL_TEST_OCR_WORDS",
        skipDedupe: true,
        data: {
          appUrl,
          message: OCR_VERIFY_WORDS_BODY,
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
