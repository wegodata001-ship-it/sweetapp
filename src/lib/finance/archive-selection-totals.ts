import { isExpenseDocument } from "@/lib/finance/counterparty-filter";
import { formatShekel } from "@/lib/format-shekel";
import type { FinanceDocumentRow } from "@/lib/finance/types";

export type ArchiveSelectionTotals = {
  count: number;
  total: number;
  income: number;
  expense: number;
  hasIncome: boolean;
  hasExpense: boolean;
  mixed: boolean;
  net: number;
};

export function documentArchiveAmount(row: FinanceDocumentRow): number {
  const n = row.total_amount;
  return Number.isFinite(n) ? n : 0;
}

export function computeArchiveSelectionTotals(
  rows: FinanceDocumentRow[],
  selectedIds: Set<string>,
): ArchiveSelectionTotals {
  let count = 0;
  let income = 0;
  let expense = 0;
  let hasIncome = false;
  let hasExpense = false;

  for (const row of rows) {
    if (!selectedIds.has(row.id)) continue;
    count += 1;
    const amount = documentArchiveAmount(row);
    if (isExpenseDocument(row)) {
      hasExpense = true;
      expense += amount;
    } else {
      hasIncome = true;
      income += amount;
    }
  }

  return {
    count,
    total: income + expense,
    income,
    expense,
    hasIncome,
    hasExpense,
    mixed: hasIncome && hasExpense,
    net: income - expense,
  };
}

function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/** ייצוא CSV ללקוח — כולל כותרת סיכום בראש הקובץ */
export function buildArchiveSelectionCsv(
  rows: FinanceDocumentRow[],
  selectedIds: Set<string>,
  totals: ArchiveSelectionTotals,
  meta: {
    summaryCount: string;
    summaryAmount: string;
    colTitle: string;
    colCategory: string;
    colDate: string;
    colAmount: string;
  },
): string {
  const selected = rows.filter((r) => selectedIds.has(r.id));
  const headerLines = [
    meta.summaryCount,
    meta.summaryAmount,
    "",
    [meta.colTitle, meta.colCategory, meta.colDate, meta.colAmount]
      .map(escapeCsvCell)
      .join(","),
  ];
  const dataLines = selected.map((row) =>
    [
      escapeCsvCell(row.title),
      escapeCsvCell(row.category),
      escapeCsvCell(row.doc_date ?? ""),
      escapeCsvCell(String(documentArchiveAmount(row))),
    ].join(","),
  );
  return [...headerLines, ...dataLines].join("\r\n");
}

export function formatArchiveSelectionAmount(value: number): string {
  return formatShekel(value);
}
