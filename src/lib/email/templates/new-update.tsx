import { Text } from "@react-email/components";
import { BaseEmailTemplate } from "@/lib/email/templates/base-template";

export type NewUpdateEmailData = {
  appUrl: string;
  title: string;
  body: string;
  actionUrl?: string;
};

export function NewUpdateEmail({ data }: { data: NewUpdateEmailData }) {
  return (
    <BaseEmailTemplate
      previewText={data.title}
      headline="נוסף עדכון מערכת חדש"
      tone="INFO"
      appUrl={data.appUrl}
      ctaLabel="צפייה בעדכון"
      ctaUrl={data.actionUrl || `${data.appUrl}/me/dashboard?update=1`}
    >
      <Text style={{ color: "#0f172a", fontSize: 16, fontWeight: 700, margin: "0 0 8px" }}>{data.title}</Text>
      <Text style={{ color: "#475569", fontSize: 14, lineHeight: "24px", margin: 0, whiteSpace: "pre-wrap" }}>
        {data.body}
      </Text>
    </BaseEmailTemplate>
  );
}
