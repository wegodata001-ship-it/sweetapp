import type { CSSProperties, ReactNode } from "react";
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import type { BaseEmailProps } from "@/lib/email/types";
import { EMAIL_TONE_COLORS } from "@/lib/email/types";

const NAVY = "#0b1f3a";
const GOLD = "#c9a227";

export function BaseEmailTemplate({
  previewText,
  headline,
  tone,
  appUrl,
  ctaLabel = "כניסה למערכת",
  ctaUrl,
  children,
}: BaseEmailProps) {
  const colors = EMAIL_TONE_COLORS[tone];
  const actionHref = ctaUrl?.trim() || appUrl;

  return (
    <Html dir="rtl" lang="he">
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={bodyStyle}>
        <Container style={outer}>
          <Section style={header}>
            <Text style={logoMark}>WEGO BUSINESS</Text>
            <Heading style={headerTitle}>WEGO BUSINESS ERP</Heading>
            <Text style={headerSub}>מערכת ניהול חכמה</Text>
          </Section>

          <Section style={{ ...card, borderInlineStart: `4px solid ${colors.accent}` }}>
            <Text style={{ ...badge, backgroundColor: colors.bg, color: colors.accent }}>{headline}</Text>
            {children}
            {actionHref ? (
              <Section style={{ textAlign: "center", marginTop: 24 }}>
                <Button href={actionHref} style={{ ...btn, backgroundColor: NAVY, borderColor: GOLD }}>
                  {ctaLabel}
                </Button>
              </Section>
            ) : null}
          </Section>

          <Hr style={hr} />
          <Section style={footer}>
            <Text style={footerText}>נשלח אוטומטית ממערכת WEGO ERP</Text>
            <Text style={footerMuted}>אין להשיב למייל זה</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const bodyStyle: CSSProperties = {
  backgroundColor: "#f1f5f9",
  fontFamily: "Arial, Helvetica, sans-serif",
  margin: 0,
  padding: "24px 12px",
};

const outer: CSSProperties = {
  margin: "0 auto",
  maxWidth: 560,
  width: "100%",
};

const header: CSSProperties = {
  backgroundColor: NAVY,
  borderRadius: "16px 16px 0 0",
  padding: "28px 24px",
  textAlign: "center",
};

const logoMark: CSSProperties = {
  color: GOLD,
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: 2,
  margin: "0 0 8px",
};

const headerTitle: CSSProperties = {
  color: "#ffffff",
  fontSize: 22,
  fontWeight: 800,
  margin: "0 0 4px",
};

const headerSub: CSSProperties = {
  color: "#94a3b8",
  fontSize: 13,
  margin: 0,
};

const card: CSSProperties = {
  backgroundColor: "#ffffff",
  borderRadius: "0 0 16px 16px",
  boxShadow: "0 8px 24px rgba(15, 23, 42, 0.08)",
  padding: "28px 24px",
};

const badge: CSSProperties = {
  borderRadius: 8,
  display: "inline-block",
  fontSize: 13,
  fontWeight: 700,
  margin: "0 0 16px",
  padding: "6px 12px",
};

const btn: CSSProperties = {
  borderRadius: 10,
  color: "#ffffff",
  fontSize: 14,
  fontWeight: 700,
  padding: "12px 28px",
  textDecoration: "none",
};

const hr: CSSProperties = {
  borderColor: "#e2e8f0",
  margin: "20px 0",
};

const footer: CSSProperties = {
  padding: "0 8px 16px",
  textAlign: "center",
};

const footerText: CSSProperties = {
  color: "#64748b",
  fontSize: 12,
  margin: "0 0 4px",
};

const footerMuted: CSSProperties = {
  color: "#94a3b8",
  fontSize: 11,
  margin: 0,
};

export function EmailDetailRow({ label, value }: { label: string; value: string }) {
  return (
    <Section style={row}>
      <Text style={rowLabel}>{label}</Text>
      <Text style={rowValue}>{value}</Text>
    </Section>
  );
}

const row: CSSProperties = {
  marginBottom: 10,
};

const rowLabel: CSSProperties = {
  color: "#64748b",
  fontSize: 12,
  fontWeight: 700,
  margin: "0 0 2px",
};

const rowValue: CSSProperties = {
  color: "#0f172a",
  fontSize: 15,
  fontWeight: 600,
  margin: 0,
};
