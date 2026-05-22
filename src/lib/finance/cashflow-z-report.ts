import { paymentMethodLabel } from "@/lib/finance/cashflow-display";
import type { ZReportPayload } from "@/lib/finance/document-payload";
import type { CashFlowRow } from "@/lib/finance/types";

export type ZReportCashflowSummary = {
  zReportId: string;
  documentId: string;
  entryDate: string;
  title: string;
  zNumber: string;
  totalInflow: number;
  totalOutflow: number;
  paymentMethodLabels: string[];
  lineCount: number;
  representativeRowId: string;
};

export type JournalDisplayItem =
  | { kind: "z"; summary: ZReportCashflowSummary; sortKey: string }
  | { kind: "row"; row: CashFlowRow; sortKey: string };

export function parseZNumberFromText(text: string): string {
  const s = text.trim();
  const m =
    s.match(/דוח\s*Z\s*#?\s*(\d+)/i) ??
    s.match(/\bZ\s*#?\s*(\d+)/i) ??
    s.match(/#\s*(\d+)\b/);
  return m?.[1] ?? "";
}

export function extractZReportTitle(lines: CashFlowRow[]): string {
  for (const row of lines) {
    const parts = (row.description ?? "").split(/\s*[—–]\s*/);
    const tail = parts.length >= 2 ? parts[parts.length - 1]!.trim() : "";
    if (tail && /דוח\s*Z/i.test(tail)) return tail;
    if (tail) return tail;
  }
  return "דוח Z";
}

export function groupCashflowByZReport(rows: CashFlowRow[]): Map<string, CashFlowRow[]> {
  const map = new Map<string, CashFlowRow[]>();
  for (const row of rows) {
    const key = row.z_report_id?.trim();
    if (!key) continue;
    const list = map.get(key) ?? [];
    list.push(row);
    map.set(key, list);
  }
  return map;
}

export function buildZReportSummary(zReportId: string, lines: CashFlowRow[]): ZReportCashflowSummary {
  const sorted = [...lines].sort((a, b) => a.entry_date.localeCompare(b.entry_date));
  const title = extractZReportTitle(sorted);
  const zNumber = parseZNumberFromText(title) || parseZNumberFromText(sorted[0]?.description ?? "");
  const methods = new Set<string>();
  let totalInflow = 0;
  let totalOutflow = 0;
  for (const row of sorted) {
    totalInflow += row.inflow;
    totalOutflow += row.outflow;
    const label = paymentMethodLabel(row.payment_method);
    if (label) methods.add(label);
  }
  return {
    zReportId,
    documentId: zReportId,
    entryDate: sorted[0]?.entry_date ?? "",
    title,
    zNumber,
    totalInflow,
    totalOutflow,
    paymentMethodLabels: Array.from(methods),
    lineCount: sorted.length,
    representativeRowId: sorted[0]?.id ?? zReportId,
  };
}

/** מפריד שורות דוח Z לכרטיסי סיכום; שאר התנועות נשארות שורות רגילות. */
export function buildJournalDisplayItems(rows: CashFlowRow[]): JournalDisplayItem[] {
  const zGroups = groupCashflowByZReport(rows);
  const zIds = new Set(zGroups.keys());
  const items: JournalDisplayItem[] = [];

  for (const [zReportId, lines] of zGroups) {
    const summary = buildZReportSummary(zReportId, lines);
    items.push({
      kind: "z",
      summary,
      sortKey: `${summary.entryDate}\0z\0${zReportId}`,
    });
  }

  for (const row of rows) {
    if (row.z_report_id && zIds.has(row.z_report_id)) continue;
    items.push({
      kind: "row",
      row,
      sortKey: `${row.entry_date}\0r\0${row.id}`,
    });
  }

  items.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  return items;
}

export function journalDisplayTotals(items: JournalDisplayItem[]): { totalIn: number; totalOut: number } {
  let totalIn = 0;
  let totalOut = 0;
  for (const item of items) {
    if (item.kind === "z") {
      totalIn += item.summary.totalInflow;
      totalOut += item.summary.totalOutflow;
    } else {
      totalIn += item.row.inflow;
      totalOut += item.row.outflow;
    }
  }
  return { totalIn, totalOut };
}

export function zReportMatchesPaymentFilter(
  summary: ZReportCashflowSummary,
  lines: CashFlowRow[],
  filterPaymentMethod: string,
): boolean {
  const want = filterPaymentMethod.trim();
  if (!want) return true;
  return lines.some((r) => (r.payment_method ?? "").trim() === want);
}

export type ZReportDetailPayload = {
  summary: ZReportCashflowSummary & {
    time: string | null;
    status: string;
    cashierLabel: string | null;
  };
  document: {
    id: string;
    title: string;
    totalAmount: number;
    paymentStatus: string;
    docDate: string | null;
    createdAt: string;
    notes: string | null;
  };
  payload: ZReportPayload;
  lines: CashFlowRow[];
  breakdown: {
    cashTaxable: number;
    cashExempt: number;
    creditTaxable: number;
    creditExempt: number;
    transfers: number;
    cashTotal: number;
    creditTotal: number;
    transferTotal: number;
  };
  items: Array<{
    id: string;
    itemName: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }>;
};

export function zBreakdownFromPayload(payload: ZReportPayload) {
  const cashTotal = Math.max(0, payload.cashTaxable + payload.cashExempt);
  const creditTotal = Math.max(0, payload.creditTaxable + payload.creditExempt);
  const transferTotal = Math.max(0, payload.transfers);
  return {
    cashTaxable: payload.cashTaxable,
    cashExempt: payload.cashExempt,
    creditTaxable: payload.creditTaxable,
    creditExempt: payload.creditExempt,
    transfers: payload.transfers,
    cashTotal,
    creditTotal,
    transferTotal,
  };
}
