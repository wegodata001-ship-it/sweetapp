import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import {
  buildCashFlowRowsForDocument,
  type CashFlowDocumentInput,
} from "@/lib/finance/cashflow-rows";
import { computeDocumentPaymentTotals } from "@/lib/finance/payment-totals";
import { prisma } from "@/lib/prisma";

export class PaymentOverLimitError extends Error {
  constructor() {
    super("סכום התשלומים לא יכול לעלות על סה״כ המסמך");
    this.name = "PaymentOverLimitError";
  }
}

export class PaymentDocumentNotFoundError extends Error {
  constructor() {
    super("לא נמצא");
    this.name = "PaymentDocumentNotFoundError";
  }
}

export type SavedPayment = {
  id: string;
  customerId: string;
  documentId: string | null;
  amount: number;
  paymentMethod: string | null;
  notes: string | null;
  createdAt: Date;
};

export type DocumentPaymentInput = {
  customerId: string;
  documentId: string;
  amount: number;
  paymentMethod?: string | null;
  notes?: string | null;
  check?: {
    checkNumber: string;
    bankName: string;
    branch?: string | null;
    dueDate: Date;
    notes?: string | null;
    createdById?: string | null;
  } | null;
};

type PaymentSnapRow = {
  id: string;
  title: string;
  category: string;
  documentType: string;
  totalAmount: number;
  notes: string | null;
  metadata: unknown;
  docDate: Date | null;
  createdAt: Date;
  customerId: string | null;
  customerName: string | null;
  payments: Array<{
    id: string;
    amount: number;
    paymentMethod: string | null;
    notes: string | null;
  }> | null;
};

export function newFinanceRowId(): string {
  return `c${randomBytes(12).toString("hex")}`.slice(0, 25);
}

/**
 * BEFORE (document-linked cash): 9 sequential RTTs
 * Q1 document lookup KEEP→MERGE into snap
 * Q2 payment sum KEEP→MERGE into snap
 * Q3 payment create KEEP→MERGE write
 * Q4 totals document re-read REMOVE
 * Q5 totals payment sum REMOVE
 * Q6 totals update KEEP→MERGE write
 * Q7 cashflow document+payments re-read REMOVE
 * Q8 cashflow delete KEEP→MERGE write
 * Q9 cashflow create KEEP→MERGE write
 * logActivity MOVE AFTER COMMIT
 *
 * AFTER: 1 read + 1 write (2 RTT). Cashflow replaced for document D only.
 */
export async function saveDocumentLinkedPayment(input: DocumentPaymentInput): Promise<SavedPayment> {
  const snap = await loadPaymentDocumentSnapshot(input.documentId);
  if (!snap) throw new PaymentDocumentNotFoundError();

  const existing = (snap.payments ?? []).map((p) => ({
    id: p.id,
    amount: Number(p.amount),
    paymentMethod: p.paymentMethod,
    notes: p.notes,
  }));
  const paidSoFar = existing.reduce((sum, p) => sum + Math.max(0, p.amount), 0);
  if (paidSoFar + input.amount > Number(snap.totalAmount) + 1e-9) {
    throw new PaymentOverLimitError();
  }

  const paymentId = newFinanceRowId();
  const createdAt = new Date();
  const method = input.paymentMethod?.trim() || null;
  const notes = input.notes?.trim() || null;
  const paymentsAfter = [
    ...existing,
    { id: paymentId, amount: input.amount, paymentMethod: method, notes },
  ];
  const totals = computeDocumentPaymentTotals({
    totalAmount: Number(snap.totalAmount),
    documentType: snap.documentType,
    metadata: snap.metadata,
    paidFromDb: paidSoFar + input.amount,
  });

  const docInput: CashFlowDocumentInput = {
    id: snap.id,
    documentType: snap.documentType,
    title: snap.title,
    category: snap.category,
    totalAmount: Number(snap.totalAmount),
    notes: snap.notes,
    metadata: snap.metadata,
    docDate: snap.docDate,
    createdAt: snap.createdAt,
    customerId: snap.customerId,
    customerName: snap.customerName,
    payments: paymentsAfter,
  };
  const cashflowRows =
    snap.documentType === "דוח Z" ? [] : buildCashFlowRowsForDocument(docInput);

  const written = await persistDocumentPayment({
    paymentId,
    customerId: input.customerId,
    documentId: input.documentId,
    amount: input.amount,
    paymentMethod: method,
    notes,
    createdAt,
    paid: totals.paid,
    remaining: totals.remaining,
    paymentStatus: totals.paymentStatus,
    replaceCashflow: snap.documentType !== "דוח Z",
    cashflowRows,
    check: input.check ?? null,
  });
  if (!written) throw new PaymentOverLimitError();

  return {
    id: paymentId,
    customerId: input.customerId,
    documentId: input.documentId,
    amount: input.amount,
    paymentMethod: method,
    notes,
    createdAt,
  };
}

export async function saveStandalonePayment(input: {
  customerId: string;
  amount: number;
  paymentMethod?: string | null;
  notes?: string | null;
}): Promise<SavedPayment> {
  const paymentId = newFinanceRowId();
  const createdAt = new Date();
  const method = input.paymentMethod?.trim() || null;
  const notes = input.notes?.trim() || null;
  await prisma.$executeRaw`
    WITH pay AS (
      INSERT INTO "Payment" (id, "customerId", "documentId", amount, "paymentMethod", notes, "createdAt")
      VALUES (${paymentId}, ${input.customerId}, NULL, ${input.amount}, ${method}, ${notes}, ${createdAt})
      RETURNING id
    )
    INSERT INTO "CashFlowEntry" (
      id, "entryType", amount, description, "paymentMethod", "customerId", "customerName",
      notes, "paymentId", "documentId", "relatedDocumentId", "entryDate", "isDirect"
    )
    SELECT
      ${newFinanceRowId()},
      'income',
      ${input.amount},
      'תשלום לקוח',
      ${method},
      ${input.customerId},
      (SELECT name FROM "Customer" WHERE id = ${input.customerId}),
      ${notes},
      pay.id,
      NULL,
      NULL,
      ${createdAt}::date,
      false
    FROM pay
  `;
  return {
    id: paymentId,
    customerId: input.customerId,
    documentId: null,
    amount: input.amount,
    paymentMethod: method,
    notes,
    createdAt,
  };
}

async function loadPaymentDocumentSnapshot(documentId: string): Promise<PaymentSnapRow | null> {
  const rows = await prisma.$queryRaw<PaymentSnapRow[]>`
    SELECT
      d.id,
      d.title,
      d.category,
      d."documentType",
      d."totalAmount",
      d.notes,
      d.metadata,
      d."docDate",
      d."createdAt",
      d."customerId",
      c.name AS "customerName",
      COALESCE(
        json_agg(
          json_build_object(
            'id', p.id,
            'amount', p.amount,
            'paymentMethod', p."paymentMethod",
            'notes', p.notes
          ) ORDER BY p."createdAt" ASC
        ) FILTER (WHERE p.id IS NOT NULL),
        '[]'::json
      ) AS payments
    FROM "FinancialDocument" d
    LEFT JOIN "Customer" c ON c.id = d."customerId"
    LEFT JOIN "Payment" p ON p."documentId" = d.id
    WHERE d.id = ${documentId}
    GROUP BY d.id, c.name
  `;
  return rows[0] ?? null;
}

async function persistDocumentPayment(input: {
  paymentId: string;
  customerId: string;
  documentId: string;
  amount: number;
  paymentMethod: string | null;
  notes: string | null;
  createdAt: Date;
  paid: number;
  remaining: number;
  paymentStatus: string;
  replaceCashflow: boolean;
  cashflowRows: Prisma.CashFlowEntryCreateManyInput[];
  check: DocumentPaymentInput["check"];
}): Promise<boolean> {
  const cfValues =
    input.replaceCashflow && input.cashflowRows.length > 0
      ? input.cashflowRows.map(
          (row) => Prisma.sql`(
            ${newFinanceRowId()},
            ${row.entryType},
            ${Number(row.amount)},
            ${row.description ?? null},
            ${row.relatedDocumentId ?? null},
            ${row.entryDate}::date,
            false,
            ${row.customerName ?? null},
            ${row.notes ?? null},
            ${row.paymentMethod ?? null},
            ${row.documentId ?? null},
            ${row.customerId ?? null},
            ${row.paymentId ?? null},
            ${row.expenseType ?? null}
          )`,
        )
      : null;

  const checkSql = input.check
    ? Prisma.sql`,
      chk AS (
        INSERT INTO "CheckPayment" (
          id, "customerId", "paymentId", "documentId", "checkNumber", "bankName",
          branch, amount, "dueDate", notes, status, "createdById"
        )
        SELECT
          ${newFinanceRowId()},
          ${input.customerId},
          pay.id,
          ${input.documentId},
          ${input.check.checkNumber},
          ${input.check.bankName},
          ${input.check.branch ?? null},
          ${input.amount},
          ${input.check.dueDate}::date,
          ${input.check.notes ?? null},
          'PENDING',
          ${input.check.createdById ?? null}
        FROM pay
      )`
    : Prisma.sql``;

  const cfInsert = cfValues
    ? Prisma.sql`,
      ins_cf AS (
        INSERT INTO "CashFlowEntry" (
          id, "entryType", amount, description, "relatedDocumentId", "entryDate",
          "isDirect", "customerName", notes, "paymentMethod", "documentId",
          "customerId", "paymentId", "expenseType"
        )
        SELECT v.* FROM (VALUES ${Prisma.join(cfValues)}) AS v(
          id, "entryType", amount, description, "relatedDocumentId", "entryDate",
          "isDirect", "customerName", notes, "paymentMethod", "documentId",
          "customerId", "paymentId", "expenseType"
        )
        WHERE EXISTS (SELECT 1 FROM pay)
      )`
    : Prisma.sql``;

  const delSql = input.replaceCashflow
    ? Prisma.sql`,
      del AS (
        DELETE FROM "CashFlowEntry"
        WHERE "isDirect" = false
          AND ("documentId" = ${input.documentId} OR "relatedDocumentId" = ${input.documentId})
          AND EXISTS (SELECT 1 FROM pay)
        RETURNING id
      )`
    : Prisma.sql``;

  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    WITH pay AS (
      INSERT INTO "Payment" (id, "customerId", "documentId", amount, "paymentMethod", notes, "createdAt")
      SELECT ${input.paymentId}, ${input.customerId}, ${input.documentId}, ${input.amount},
             ${input.paymentMethod}, ${input.notes}, ${input.createdAt}
      WHERE (
        SELECT COALESCE(SUM(amount), 0) FROM "Payment" WHERE "documentId" = ${input.documentId}
      ) + ${input.amount}
        <= (SELECT "totalAmount" FROM "FinancialDocument" WHERE id = ${input.documentId}) + 1e-9
      RETURNING id
    ),
    upd AS (
      UPDATE "FinancialDocument"
      SET "paidAmount" = ${input.paid},
          "remainingAmount" = ${input.remaining},
          "paymentStatus" = ${input.paymentStatus}
      FROM pay
      WHERE "FinancialDocument".id = ${input.documentId}
      RETURNING "FinancialDocument".id
    )
    ${delSql}
    ${cfInsert}
    ${checkSql}
    SELECT id FROM pay
  `;
  return rows.length > 0;
}
