import { Text } from "@react-email/components";
import { BaseEmailTemplate, EmailDetailRow } from "@/lib/email/templates/base-template";

export type FutureOrderEmailData = {
  appUrl: string;
  customerName: string;
  eventDate: string;
  amount: string;
  status: string;
  orderNumber?: string;
  actionUrl?: string;
};

export function FutureOrderEmail({ data }: { data: FutureOrderEmailData }) {
  return (
    <BaseEmailTemplate
      previewText="הזמנה עתידית מתקרבת"
      headline="הזמנה עתידית מתקרבת"
      tone="WARNING"
      appUrl={data.appUrl}
      ctaLabel="פתיחת הזמנות"
      ctaUrl={data.actionUrl || `${data.appUrl}/admin/future-orders`}
    >
      <EmailDetailRow label="לקוח" value={data.customerName} />
      {data.orderNumber ? <EmailDetailRow label="מספר הזמנה" value={data.orderNumber} /> : null}
      <EmailDetailRow label="תאריך אירוע" value={data.eventDate} />
      <EmailDetailRow label="סכום" value={data.amount} />
      <EmailDetailRow label="סטטוס" value={data.status} />
      <Text style={{ color: "#475569", fontSize: 13, lineHeight: "22px", marginTop: 12 }}>
        מומלץ לוודא היערכות מלאה לפני מועד האירוע.
      </Text>
    </BaseEmailTemplate>
  );
}
