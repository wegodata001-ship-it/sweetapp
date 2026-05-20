import { Text } from "@react-email/components";
import { BaseEmailTemplate, EmailDetailRow } from "@/lib/email/templates/base-template";

export type CheckDepositEmailData = {
  appUrl: string;
  customerName: string;
  amount: string;
  dueDate: string;
  status: string;
  actionUrl?: string;
};

export function CheckDepositEmail({ data }: { data: CheckDepositEmailData }) {
  return (
    <BaseEmailTemplate
      previewText="יש צ'ק להפקדה"
      headline="יש צ'ק שממתין להפקדה"
      tone="INFO"
      appUrl={data.appUrl}
      ctaLabel="פתיחת צ'קים"
      ctaUrl={data.actionUrl || `${data.appUrl}/finance/checks`}
    >
      <EmailDetailRow label="לקוח" value={data.customerName} />
      <EmailDetailRow label="סכום" value={data.amount} />
      <EmailDetailRow label="תאריך פירעון" value={data.dueDate} />
      <EmailDetailRow label="סטטוס" value={data.status} />
      <Text style={{ color: "#475569", fontSize: 13, lineHeight: "22px", marginTop: 12 }}>
        יש לטפל בהפקדה במועד כדי למנוע עיכובים בגבייה.
      </Text>
    </BaseEmailTemplate>
  );
}
