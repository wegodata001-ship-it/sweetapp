import { Text } from "@react-email/components";
import { BaseEmailTemplate, EmailDetailRow } from "@/lib/email/templates/base-template";

export type TaskAssignedEmailData = {
  appUrl: string;
  taskTitle: string;
  managerName?: string;
  deadline?: string;
  priority?: string;
  actionUrl?: string;
};

export function TaskAssignedEmail({ data }: { data: TaskAssignedEmailData }) {
  return (
    <BaseEmailTemplate
      previewText={`משימה חדשה: ${data.taskTitle}`}
      headline="נוספה לך משימה חדשה"
      tone="TASK"
      appUrl={data.appUrl}
      ctaLabel="התחל משימה"
      ctaUrl={data.actionUrl || `${data.appUrl}/employee/tasks`}
    >
      <EmailDetailRow label="שם משימה" value={data.taskTitle} />
      {data.managerName ? <EmailDetailRow label="מנהל" value={data.managerName} /> : null}
      {data.deadline ? <EmailDetailRow label="דדליין" value={data.deadline} /> : null}
      {data.priority ? <EmailDetailRow label="עדיפות" value={data.priority} /> : null}
      <Text style={{ color: "#475569", fontSize: 13, lineHeight: "22px", marginTop: 12 }}>
        היכנס למערכת כדי להתחיל לעבוד על המשימה.
      </Text>
    </BaseEmailTemplate>
  );
}
