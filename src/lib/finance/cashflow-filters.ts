import type { CashFlowEntry } from "@prisma/client";
import { prismaCashFlowToRow } from "@/lib/finance/cashflow-map";
import { parsePayload } from "@/lib/finance/document-payload";
import { isExpenseType, normalizeExpenseType, type ExpenseType } from "@/lib/finance/expense-types";
import { prisma } from "@/lib/prisma";
import type { CashFlowRow } from "@/lib/finance/types";

export type CashflowListFilters = {
  entryType?: "income" | "expense" | null;
  expenseType?: ExpenseType | null;
};

function rowEntryTypeKey(entryType: string | null | undefined): string {
  return (entryType ?? "").trim().toLowerCase();
}

/** ממלא expense_type מתוך מסמך מקושר כשחסר בעמודה */
export async function enrichCashFlowRowsWithExpenseType(
  entries: CashFlowEntry[],
  rows: CashFlowRow[],
): Promise<CashFlowRow[]> {
  const needDoc = entries.filter(
    (e, i) =>
      !e.expenseType &&
      e.documentId &&
      rowEntryTypeKey(e.entryType) === "expense" &&
      !rows[i]?.expense_type,
  );
  if (!needDoc.length) return rows;

  const docIds = [...new Set(needDoc.map((e) => e.documentId!).filter(Boolean))];
  const docs = await prisma.financialDocument.findMany({
    where: { id: { in: docIds } },
    select: { id: true, metadata: true },
  });
  const byDoc = new Map(
    docs.map((d) => {
      const meta = parsePayload(d.metadata as unknown);
      const et = meta?.kind === "expense" ? normalizeExpenseType(meta.expenseType) : null;
      return [d.id, et] as const;
    }),
  );

  return rows.map((row) => {
    if (row.expense_type || rowEntryTypeKey(row.entry_type) !== "expense" || !row.document_id) {
      return row;
    }
    const fromDoc = byDoc.get(row.document_id) ?? null;
    return fromDoc ? { ...row, expense_type: fromDoc } : row;
  });
}

/** ממלא supplier_id / employee_id מתוך מסמך מקושר */
export async function enrichCashFlowRowsWithCounterparty(
  entries: CashFlowEntry[],
  rows: CashFlowRow[],
): Promise<CashFlowRow[]> {
  const docIds = [
    ...new Set(
      entries
        .map((e) => e.documentId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  if (!docIds.length) return rows;

  const docs = await prisma.financialDocument.findMany({
    where: { id: { in: docIds } },
    select: { id: true, supplierId: true, employeeId: true, metadata: true },
  });

  const byDoc = new Map(
    docs.map((d) => {
      const meta = parsePayload(d.metadata as unknown);
      const supplierId =
        d.supplierId?.trim() ||
        (meta?.kind === "expense" && meta.supplierId?.trim() ? meta.supplierId.trim() : null);
      const employeeId =
        d.employeeId?.trim() ||
        (meta?.kind === "expense" && meta.employeeId?.trim() ? meta.employeeId.trim() : null);
      return [d.id, { supplierId, employeeId }] as const;
    }),
  );

  return rows.map((row, index) => {
    const docId = entries[index]?.documentId ?? row.document_id;
    if (!docId) return row;
    const cp = byDoc.get(docId);
    if (!cp) return row;
    return {
      ...row,
      supplier_id: cp.supplierId,
      employee_id: cp.employeeId,
    };
  });
}

export function applyCashflowListFilters(rows: CashFlowRow[], filters: CashflowListFilters): CashFlowRow[] {
  let data = rows;
  const entryType = filters.entryType;
  if (entryType === "income") {
    data = data.filter((r) => rowEntryTypeKey(r.entry_type) === "income");
  } else if (entryType === "expense") {
    data = data.filter((r) => rowEntryTypeKey(r.entry_type) === "expense");
    const et = filters.expenseType;
    if (et) {
      data = data.filter((r) => r.expense_type === et);
    }
  }
  return data;
}

export function parseCashflowQueryFilters(searchParams: URLSearchParams): CashflowListFilters {
  const entryTypeRaw = searchParams.get("entryType")?.trim().toLowerCase();
  const entryType =
    entryTypeRaw === "income" || entryTypeRaw === "expense" ? entryTypeRaw : null;
  const expenseTypeRaw = searchParams.get("expenseType")?.trim();
  const expenseType =
    entryType === "expense" && expenseTypeRaw && isExpenseType(expenseTypeRaw)
      ? expenseTypeRaw
      : null;
  return { entryType, expenseType };
}

export async function listCashFlowRows(filters: CashflowListFilters): Promise<CashFlowRow[]> {
  const joined = await prisma.$queryRaw<
    Array<{
      id: string;
      entryType: string;
      amount: number;
      description: string | null;
      relatedDocumentId: string | null;
      entryDate: Date;
      isDirect: boolean;
      createdAt: Date;
      customerName: string | null;
      notes: string | null;
      paymentMethod: string | null;
      documentId: string | null;
      customerId: string | null;
      paymentId: string | null;
      source: string | null;
      zReportId: string | null;
      expenseType: string | null;
      relatedOrderId: string | null;
      orderPaymentId: string | null;
      doc_metadata: unknown;
      doc_supplier_id: string | null;
      doc_employee_id: string | null;
    }>
  >`
    SELECT
      e.id, e."entryType", e.amount, e.description, e."relatedDocumentId",
      e."entryDate", e."isDirect", e."createdAt", e."customerName", e.notes,
      e."paymentMethod", e."documentId", e."customerId", e."paymentId",
      e.source, e."zReportId", e."expenseType", e."relatedOrderId", e."orderPaymentId",
      d.metadata AS doc_metadata,
      d."supplierId" AS doc_supplier_id,
      d."employeeId" AS doc_employee_id
    FROM "CashFlowEntry" e
    LEFT JOIN "FinancialDocument" d ON d.id = COALESCE(e."documentId", e."relatedDocumentId")
    ORDER BY e."entryDate" DESC, e."createdAt" DESC
  `;

  const entries = joined.map((row) => ({
    id: row.id,
    entryType: row.entryType,
    amount: Number(row.amount),
    description: row.description,
    relatedDocumentId: row.relatedDocumentId,
    entryDate: row.entryDate instanceof Date ? row.entryDate : new Date(String(row.entryDate)),
    isDirect: Boolean(row.isDirect),
    createdAt: row.createdAt instanceof Date ? row.createdAt : new Date(String(row.createdAt)),
    customerName: row.customerName,
    notes: row.notes,
    paymentMethod: row.paymentMethod,
    documentId: row.documentId,
    customerId: row.customerId,
    paymentId: row.paymentId,
    source: row.source,
    zReportId: row.zReportId,
    expenseType: row.expenseType,
    relatedOrderId: row.relatedOrderId,
    orderPaymentId: row.orderPaymentId,
  })) as CashFlowEntry[];

  const mapped = entries.map((row, index) => {
    const base = prismaCashFlowToRow(row);
    const doc = joined[index];
    const meta = parsePayload(doc?.doc_metadata as unknown);
    const expenseFromDoc =
      !base.expense_type &&
      rowEntryTypeKey(base.entry_type) === "expense" &&
      meta?.kind === "expense"
        ? normalizeExpenseType(meta.expenseType)
        : null;
    const supplierId =
      doc?.doc_supplier_id?.trim() ||
      (meta?.kind === "expense" && meta.supplierId?.trim() ? meta.supplierId.trim() : null);
    const employeeId =
      doc?.doc_employee_id?.trim() ||
      (meta?.kind === "expense" && meta.employeeId?.trim() ? meta.employeeId.trim() : null);
    return {
      ...base,
      expense_type: base.expense_type || expenseFromDoc,
      supplier_id: supplierId,
      employee_id: employeeId,
    };
  });

  return applyCashflowListFilters(mapped, filters);
}
