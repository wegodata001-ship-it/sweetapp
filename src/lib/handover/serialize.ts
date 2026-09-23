/**
 * Safe row serialization: IDs unchanged, nulls kept, amounts as decimal strings,
 * timestamps as ISO-8601. Never emits password/session/secret fields.
 */
import { USER_EXCLUDED_FIELDS } from "./catalog";

export const ALWAYS_EXCLUDED_FIELDS = new Set<string>([
  ...USER_EXCLUDED_FIELDS,
  "codeHash",
]);

const DATE_FIELD_RE = /(?:At|Date)$|^(?:created|updated|deleted|archived|completed|started|ended|imported|uploaded|recorded|cleared|bounced|cancelled|deposited|paid|due|expires|consumed|lastLogin|lastSeen|lastStock|passwordUpdated|sentToCpa|stepStarted)/i;

export function amountToDecimalString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    const t = value.trim();
    if (t === "" || t === "null") return null;
    if (!Number.isFinite(Number(t))) return t;
    return normalizeDecimalString(t);
  }
  if (typeof value === "object" && value !== null && "toFixed" in value) {
    return normalizeDecimalString(String(value));
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return String(value);
    return jsNumberToDecimalString(value);
  }
  return String(value);
}

/** Avoid scientific notation and trailing zeros while keeping 1234.56. */
export function jsNumberToDecimalString(value: number): string {
  if (Number.isInteger(value)) return String(value);
  const fixed = value.toFixed(10);
  return normalizeDecimalString(fixed);
}

function normalizeDecimalString(raw: string): string {
  if (!raw.includes(".")) return raw;
  return raw.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
}

export function toIso8601(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return value.toISOString();
  }
  if (typeof value === "string") {
    const t = value.trim();
    if (!t) return null;
    const d = new Date(t);
    if (Number.isNaN(d.getTime())) return t;
    if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return `${t}T00:00:00.000Z`;
    return d.toISOString();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }
  return null;
}

export function isAlwaysExcludedField(key: string): boolean {
  if (ALWAYS_EXCLUDED_FIELDS.has(key)) return true;
  if (key === "mustChangePassword" || key === "passwordUpdatedAt") return false;
  const lower = key.toLowerCase();
  if (lower.includes("passwordhash")) return true;
  if (lower === "currentsessionid") return true;
  if (lower.endsWith("token") || lower.endsWith("secret")) return true;
  return false;
}

export function serializeRow(
  row: Record<string, unknown>,
  opts?: { amountFields?: string[]; excludeFields?: string[] },
): Record<string, unknown> {
  const amountFields = new Set(opts?.amountFields ?? []);
  const extraExclude = new Set(opts?.excludeFields ?? []);
  const out: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(row)) {
    if (isAlwaysExcludedField(key) || extraExclude.has(key)) continue;
    if (value === null || value === undefined) {
      out[key] = null;
      continue;
    }
    if (amountFields.has(key)) {
      out[key] = amountToDecimalString(value);
      continue;
    }
    if (value instanceof Date || (typeof value === "string" && DATE_FIELD_RE.test(key))) {
      const iso = toIso8601(value);
      out[key] = iso;
      continue;
    }
    out[key] = value;
  }
  return out;
}

export function serializeRows(
  rows: Record<string, unknown>[],
  opts?: { amountFields?: string[]; excludeFields?: string[] },
): Record<string, unknown>[] {
  return rows.map((row) => serializeRow(row, opts));
}

export function stableJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function redactSecrets(text: string): string {
  return text
    .replace(/postgres(?:ql)?:\/\/\S+/gi, "[redacted]")
    .replace(/mongodb(?:\+srv)?:\/\/\S+/gi, "[redacted]")
    .replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[redacted]")
    .replace(/Can't reach database server at `[^`]+`/gi, "Can't reach database server at [redacted-host]")
    .replace(/\b[a-z0-9-]+\.supabase\.co(?::\d+)?/gi, "[redacted-host]");
}

export function assertNoSecrets(payload: string): void {
  const lower = payload.toLowerCase();
  if (lower.includes("passwordhash") || lower.includes("currentsessionid")) {
    throw new Error("Export payload contained excluded auth fields");
  }
}
