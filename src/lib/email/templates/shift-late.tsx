import { Text } from "@react-email/components";
import { BaseEmailTemplate, EmailDetailRow } from "@/lib/email/templates/base-template";

export type ShiftLateEmailData = {
  appUrl: string;
  audience: "employee" | "manager";
  employeeName?: string;
  lateMinutes?: string;
  shiftTime?: string;
  workDate?: string;
  actionUrl?: string;
};

export function ShiftLateEmail({ data }: { data: ShiftLateEmailData }) {
  const isManager = data.audience === "manager";
  return (
    <BaseEmailTemplate
      previewText={isManager ? "עובד מאחר למשמרת" : "זוהה איחור למשמרת"}
      headline={isManager ? "עובד מאחר למשמרת" : "זוהה איחור למשמרת"}
      tone="WARNING"
      appUrl={data.appUrl}
      ctaLabel={isManager ? "צפייה בצוות" : "הוסף סיבת איחור"}
      ctaUrl={data.actionUrl || (isManager ? `${data.appUrl}/admin/staff` : `${data.appUrl}/me/dashboard?late=1`)}
    >
      {data.employeeName && isManager ? <EmailDetailRow label="עובד" value={data.employeeName} /> : null}
      {data.workDate ? <EmailDetailRow label="תאריך" value={data.workDate} /> : null}
      {data.shiftTime ? <EmailDetailRow label="משמרת" value={data.shiftTime} /> : null}
      {data.lateMinutes ? <EmailDetailRow label="איחור" value={`${data.lateMinutes} דקות`} /> : null}
      <Text style={{ color: "#475569", fontSize: 13, lineHeight: "22px", marginTop: 12 }}>
        {isManager
          ? "מומלץ ליצור קשר עם העובד ולעדכן במערכת."
          : "אנא היכנס למערכת ועדכן סיבת איחור במידת הצורך."}
      </Text>
    </BaseEmailTemplate>
  );
}
