export const FORM_FIELD_TYPE_KEYS = [
  "STRING",
  "NUMBER",
  "EMAIL",
  "PHONE",
  "DATE",
  "TIME",
  "TEXTAREA",
  "SELECT",
  "BOOLEAN",
] as const;

export type FormFieldTypeKey = (typeof FORM_FIELD_TYPE_KEYS)[number];

export const FORM_FIELD_TYPE_LABELS: Record<FormFieldTypeKey, string> = {
  STRING: "טקסט",
  NUMBER: "מספר",
  EMAIL: "אימייל",
  PHONE: "טלפון",
  DATE: "תאריך",
  TIME: "שעה",
  TEXTAREA: "טקסט ארוך",
  SELECT: "בחירה",
  BOOLEAN: "סימון (checkbox)",
};

export function isFormFieldTypeKey(v: string): v is FormFieldTypeKey {
  return (FORM_FIELD_TYPE_KEYS as readonly string[]).includes(v);
}

export function normalizeFieldType(raw: string): FormFieldTypeKey {
  const u = raw.trim().toUpperCase();
  if (isFormFieldTypeKey(u)) return u;
  return "STRING";
}

/** פירוק שורות לאפשרויות SELECT */
export function parseOptionsLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function parseOptionsJson(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((s) => s.trim());
}

export function optionsJsonToText(raw: unknown): string {
  return parseOptionsJson(raw).join("\n");
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function digitsOnlyPhone(s: string): string {
  return s.replace(/\D/g, "");
}

/** הודעת שגיאה בעברית או null אם תקין */
export function validateDynamicFieldValue(
  fieldType: string,
  value: unknown,
  required: boolean,
  selectOptions: string[],
): string | null {
  if (fieldType === "BOOLEAN") {
    if (required && value !== true) return "יש לסמן";
    return null;
  }

  const empty =
    value === undefined ||
    value === null ||
    (typeof value === "string" && value.trim() === "");

  if (required && empty) {
    return "שדה חובה";
  }

  if (!required && empty) return null;

  const str = typeof value === "string" ? value.trim() : String(value ?? "");

  switch (fieldType) {
    case "NUMBER": {
      const n = Number(str.replace(",", "."));
      if (!Number.isFinite(n)) return "הזינו מספר תקין";
      return null;
    }
    case "EMAIL": {
      if (!EMAIL_RE.test(str)) return "כתובת אימייל לא תקינה";
      return null;
    }
    case "PHONE": {
      const d = digitsOnlyPhone(str);
      if (d.length < 9 || d.length > 15) return "מספר טלפון לא תקין";
      return null;
    }
    case "DATE": {
      const t = Date.parse(str);
      if (!Number.isFinite(t)) return "תאריך לא תקין";
      return null;
    }
    case "TIME": {
      if (!/^\d{1,2}:\d{2}$/.test(str)) return "שעה לא תקינה";
      return null;
    }
    case "SELECT": {
      if (selectOptions.length === 0) return null;
      if (!selectOptions.includes(str)) return "בחרו ערך מהרשימה";
      return null;
    }
    default:
      return null;
  }
}
