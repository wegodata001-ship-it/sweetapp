import { parseCalendarDateToDbDate } from "@/lib/staff/work-date";

/** Parse a date-only business field (YYYY-MM-DD) as UTC midnight. */
export function parseBusinessDocDate(input: string | null | undefined): Date | null {
  const raw = input?.trim() ?? "";
  if (!raw) return null;
  const ymd = raw.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const d = parseCalendarDateToDbDate(ymd);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function resolveWrittenDocDate(...candidates: Array<string | null | undefined>): Date | null {
  for (const candidate of candidates) {
    const parsed = parseBusinessDocDate(candidate);
    if (parsed) return parsed;
  }
  return null;
}

export function businessDayKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/**
 * Register-form payments have no paymentDate — only createdAt.
 * Those lines belong to the document business date.
 * Later collections created through the payments API keep payment.createdAt.
 */
export function cashflowDateForRegisterIncome(documentDate: Date | null, fallback: Date): Date {
  return documentDate ?? fallback;
}

/** Dashboard period for document-linked income/deposit uses docDate when present. */
export function dashboardPeriodDate(row: {
  entryType: string;
  entryDate: Date;
  documentDocDate?: Date | null;
}): Date {
  const t = row.entryType.toLowerCase();
  if ((t === "income" || t === "deposit" || t === "invoice") && row.documentDocDate) {
    return row.documentDocDate;
  }
  return row.entryDate;
}

export function isAutoPaymentSummaryNotes(notes: string | null | undefined): boolean {
  const t = notes?.trim() ?? "";
  return /^תשלום\s/u.test(t) || t.startsWith("תקבול:");
}

export function resolveDocumentNotes(
  payloadNotes: string | null | undefined,
  storedNotes: string | null | undefined,
): string {
  const fromPayload = payloadNotes?.trim() ?? "";
  if (fromPayload) return fromPayload;
  const stored = storedNotes?.trim() ?? "";
  if (!stored || isAutoPaymentSummaryNotes(stored)) return "";
  return stored;
}

export const DOCUMENT_NOTES_MAX = 4000;

export function documentNotesForStorage(notes: string | null | undefined): string | null {
  const t = notes?.trim() ?? "";
  if (!t) return null;
  return t.length > DOCUMENT_NOTES_MAX ? t.slice(0, DOCUMENT_NOTES_MAX) : t;
}
