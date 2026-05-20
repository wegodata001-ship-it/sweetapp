import { Text } from "@react-email/components";
import { BaseEmailTemplate } from "@/lib/email/templates/base-template";

export type TestSimpleEmailData = {
  appUrl: string;
  message?: string;
};

export function TestSimpleEmail({ data }: { data: TestSimpleEmailData }) {
  return (
    <BaseEmailTemplate
      previewText="WEGO ERP — בדיקת מייל"
      headline="בדיקת מערכת מייל"
      tone="INFO"
      appUrl={data.appUrl}
      ctaLabel="כניסה למערכת"
      ctaUrl={data.appUrl}
    >
      <Text style={{ color: "#0f172a", fontSize: 15, lineHeight: "24px", margin: 0 }}>
        {data.message ??
          "זהו מייל בדיקה מ-WEGO BUSINESS ERP. אם אתה רואה את ההודעה הזו — Resend, RTL והעיצוב עובדים."}
      </Text>
      <Text style={{ color: "#64748b", fontSize: 13, lineHeight: "22px", marginTop: 16 }}>
        בדוק: RTL · צבעים · כפתור · תצוגה במובייל · תיקיית Inbox (לא Spam).
      </Text>
    </BaseEmailTemplate>
  );
}
