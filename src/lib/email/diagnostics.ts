import { getEmailConfig } from "@/lib/email/config";
import { isEmailTestMode, getEmailTestRecipient } from "@/lib/email/test-config";

export type EmailDiagnostics = {
  provider: "resend";
  configured: boolean;
  apiKeyPresent: boolean;
  apiKeyPreview: string | null;
  from: string;
  fromEmail: string;
  appUrl: string;
  testMode: boolean;
  testRecipient: string | null;
  issues: string[];
};

/** אבחון תצורת מייל — ללא חשיפת מפתח מלא */
export function getEmailDiagnostics(): EmailDiagnostics {
  const cfg = getEmailConfig();
  const issues: string[] = [];

  if (!cfg.apiKey) {
    issues.push("RESEND_API_KEY חסר — שליחת מייל מושבתת");
  } else if (cfg.apiKey.length < 10) {
    issues.push("RESEND_API_KEY נראה קצר מדי");
  }

  if (!cfg.fromEmail?.includes("@")) {
    issues.push("MAIL_FROM לא תקין");
  }

  if (!cfg.appUrl?.startsWith("http")) {
    issues.push("APP_URL חסר או לא תקין");
  }

  if (isEmailTestMode() && !getEmailTestRecipient()) {
    issues.push("EMAIL_TEST_MODE פעיל אך EMAIL_TEST_RECIPIENT חסר");
  }

  const apiKeyPreview = cfg.apiKey
    ? `${cfg.apiKey.slice(0, 6)}…${cfg.apiKey.slice(-4)}`
    : null;

  return {
    provider: "resend",
    configured: cfg.enabled,
    apiKeyPresent: Boolean(cfg.apiKey),
    apiKeyPreview,
    from: cfg.from,
    fromEmail: cfg.fromEmail,
    appUrl: cfg.appUrl,
    testMode: isEmailTestMode(),
    testRecipient: getEmailTestRecipient(),
    issues,
  };
}
