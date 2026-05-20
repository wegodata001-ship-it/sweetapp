import { Text } from "@react-email/components";
import { BaseEmailTemplate, EmailDetailRow } from "@/lib/email/templates/base-template";

export type TaskCompletedEmailData = {
  appUrl: string;
  employeeName: string;
  taskTitle: string;
  completedAt?: string;
  durationMinutes?: string;
  actionUrl?: string;
};

export function TaskCompletedEmail({ data }: { data: TaskCompletedEmailData }) {
  return (
    <BaseEmailTemplate
      previewText={`${data.employeeName} סיים משימה`}
      headline="העובד השלים משימה"
      tone="SUCCESS"
      appUrl={data.appUrl}
      ctaLabel="צפייה במשימות"
      ctaUrl={data.actionUrl || `${data.appUrl}/admin/tasks`}
    >
      <EmailDetailRow label="עובד" value={data.employeeName} />
      <EmailDetailRow label="משימה" value={data.taskTitle} />
      {data.completedAt ? <EmailDetailRow label="זמן ביצוע" value={data.completedAt} /> : null}
      {data.durationMinutes ? <EmailDetailRow label="משך ביצוע" value={data.durationMinutes} /> : null}
      <Text style={{ color: "#475569", fontSize: 13, lineHeight: "22px", marginTop: 12 }}>
        ניתן לעיין בפרטים המלאים במערכת הניהול.
      </Text>
    </BaseEmailTemplate>
  );
}
