import { Text } from "@react-email/components";
import { BaseEmailTemplate } from "@/lib/email/templates/base-template";

export type SystemAlertEmailData = {
  appUrl: string;
  title: string;
  message: string;
  actionUrl?: string;
};

export function SystemAlertEmail({ data }: { data: SystemAlertEmailData }) {
  return (
    <BaseEmailTemplate
      previewText={data.title}
      headline={data.title}
      tone="ERROR"
      appUrl={data.appUrl}
      ctaLabel="כניסה למערכת"
      ctaUrl={data.actionUrl || data.appUrl}
    >
      <Text style={{ color: "#475569", fontSize: 14, lineHeight: "24px", margin: 0, whiteSpace: "pre-wrap" }}>
        {data.message}
      </Text>
    </BaseEmailTemplate>
  );
}
