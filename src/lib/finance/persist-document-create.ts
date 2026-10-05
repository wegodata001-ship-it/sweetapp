import { Prisma } from "@prisma/client";
import {
  buildCashFlowRowsForDocument,
  buildZCashFlowRows,
  normalizedPaymentLines,
} from "@/lib/finance/cashflow-rows";
import { computeDocumentPaymentTotals } from "@/lib/finance/payment-totals";
import { parseNum } from "@/lib/format-shekel";
import { prisma } from "@/lib/prisma";
import { newFinanceRowId } from "@/lib/finance/save-document-payment";
import type { IncomeExpensePayload, ZReportPayload } from "@/lib/finance/document-payload";
import { supplierLedgerAmounts } from "@/lib/finance/expense-ledger-sync";
import { appliedExpensePaid, expenseOpenRemaining } from "@/lib/finance/expense-obligation";
import { paymentLinesHaveTypedAmount } from "@/lib/finance/document-payload";
import { documentNotesForStorage } from "@/lib/finance/document-business-date";
import { documentTypeForEmployeePay, normalizeEmployeePayType } from "@/lib/finance/employee-pay-types";
import { normalizeExpenseType } from "@/lib/finance/expense-types";
import {
  matchExistingSupplier,
  SupplierNameRequiredError,
  supplierDisplayName,
} from "@/lib/finance/supplier-resolve";

export async function resolveSupplierForPersist(
  input: { expenseType?: string | null; supplierId?: string | null; supplierName?: string | null },
): Promise<{ id: string; name: string; create: boolean } | null> {
  if (normalizeExpenseType(input.expenseType) !== "SUPPLIER_PAYMENTS") return null;
  const supplierId = input.supplierId?.trim();
  if (supplierId) {
    const selected = await prisma.supplier.findUnique({
      where: { id: supplierId },
      select: { id: true, name: true },
    });
    if (selected) return { ...selected, create: false };
  }
  const rows = await prisma.supplier.findMany({ select: { id: true, name: true } });
  const existing = matchExistingSupplier(rows, input.supplierName ?? "");
  if (existing) return { ...existing, create: false };
  const name = supplierDisplayName(input.supplierName ?? "");
  if (!name) throw new SupplierNameRequiredError();
  return { id: newFinanceRowId(), name, create: true };
}

export type PersistItem = {
  itemName: string;
  productName?: string | null;
  quantity: number;
  unitPrice: number;
  vatType?: string | null;
  total: number;
  lineNote?: string | null;
};

export async function persistZDocumentCreate(input: {
  title: string;
  category: string;
  total: number;
  z: ZReportPayload;
  docDate: Date | null;
}): Promise<{ id: string }> {
  const id = newFinanceRowId();
  const createdAt = new Date();
  const paymentStatus = input.total <= 0 ? "unpaid" : "paid";
  const cf = buildZCashFlowRows({
    documentId: id,
    title: input.title,
    totalAmount: input.total,
    docDate: input.docDate,
    createdAt,
    z: input.z,
  });
  const meta = JSON.stringify(input.z);
  const cfValues = cf.map(
    (row) => Prisma.sql`(
      ${newFinanceRowId()},
      ${row.entryType},
      ${Number(row.amount)},
      ${row.description ?? null},
      ${row.relatedDocumentId ?? null},
      ${row.entryDate}::date,
      false,
      ${row.source ?? null},
      ${row.zReportId ?? null},
      ${row.documentId ?? null},
      ${row.paymentMethod ?? null}
    )`,
  );
  const cfSql = cfValues.length
    ? Prisma.sql`,
      cf AS (
        INSERT INTO "CashFlowEntry" (
          id, "entryType", amount, description, "relatedDocumentId", "entryDate",
          "isDirect", source, "zReportId", "documentId", "paymentMethod"
        )
        SELECT * FROM (VALUES ${Prisma.join(cfValues)}) AS v(
          id, "entryType", amount, description, "relatedDocumentId", "entryDate",
          "isDirect", source, "zReportId", "documentId", "paymentMethod"
        )
      )`
    : Prisma.sql``;

  await prisma.$executeRaw`
    WITH doc AS (
      INSERT INTO "FinancialDocument" (
        id, title, category, "documentType", "totalAmount", "paidAmount",
        "remainingAmount", "paymentStatus", notes, metadata, "docDate",
        "pdfStoragePath", "sentToCpa", "createdAt"
      )
      VALUES (
        ${id}, ${input.title}, ${input.category}, ${"דוח Z"}, ${input.total}, ${input.total},
        0, ${paymentStatus}, NULL, ${meta}::jsonb, ${input.docDate}::date,
        NULL, false, ${createdAt}
      )
      RETURNING id
    )
    ${cfSql}
    SELECT id FROM doc
  `;
  return { id };
}

export async function persistIncomeExpenseDocument(input: {
  title: string;
  category: string;
  documentType: string;
  ie: IncomeExpensePayload;
  items: PersistItem[];
  productTotal: number;
  depositAmount: number;
  calculatedTotal: number;
  docDate: Date | null;
  customerName: string | null;
  supplierId: string | null;
  supplierName: string | null;
  createSupplier: boolean;
  employeeId: string | null;
}): Promise<{ id: string; customerId: string | null; supplierId: string | null }> {
  const docId = newFinanceRowId();
  const createdAt = new Date();
  const notes = documentNotesForStorage(input.ie.documentNotes);
  const isIncomeRegister = input.ie.kind === "income" && input.category === "הכנסה";
  const paymentLinesRaw = isIncomeRegister ? normalizedPaymentLines(input.ie) : [];
  const customerName = input.customerName?.trim() || (paymentLinesRaw.length > 0 ? "ללא לקוח" : null);
  const customerId = customerName ? newFinanceRowId() : null;
  const paymentLines = customerName ? paymentLinesRaw : [];
  const payments = paymentLines.map((p) => ({
    id: newFinanceRowId(),
    amount: parseNum(p.amount),
    paymentMethod: p.instrument.trim() || null,
    notes: p.notes.trim() || null,
  }));
  const paidFromDb = payments.reduce((s, p) => s + p.amount, 0);
  const totals = computeDocumentPaymentTotals({
    totalAmount: input.calculatedTotal,
    documentType: input.documentType,
    metadata: input.ie,
    paidFromDb,
  });

  const supplierId = input.supplierId;
  const supplierName = input.supplierName?.trim() || null;

  const ieForStore = {
    ...input.ie,
    supplierId: supplierId ?? input.ie.supplierId,
    counterpartyName: supplierName ?? input.ie.counterpartyName,
  };
  const meta = JSON.stringify(ieForStore);

  const items = (input.items.length
    ? input.items
    : [
        {
          itemName: "סיכום",
          productName: "סיכום",
          quantity: 1,
          unitPrice: input.productTotal,
          vatType: null,
          total: input.productTotal,
          lineNote: null,
        },
      ]
  ).map((item) => ({ ...item, id: newFinanceRowId() }));

  const cf = buildCashFlowRowsForDocument({
    id: docId,
    documentType: input.documentType,
    title: input.title,
    category: input.category,
    totalAmount: input.calculatedTotal,
    notes,
    metadata: ieForStore,
    docDate: input.docDate,
    createdAt,
    customerId,
    customerName,
    payments,
  });

  const ledger = buildExpenseLedgerRow({
    documentId: docId,
    category: input.category,
    documentType: input.documentType,
    title: input.title,
    notes,
    totalAmount: input.calculatedTotal,
    paidAmount: totals.paid,
    docDate: input.docDate,
    createdAt,
    ie: ieForStore,
    supplierId,
    employeeId: input.employeeId,
  });

  const custSql = customerName
    ? Prisma.sql`
      cust_exist AS (
        SELECT id, name FROM "Customer" WHERE name = ${customerName} LIMIT 1
      ),
      cust_ins AS (
        INSERT INTO "Customer" (id, name, "openingBalance", "createdAt")
        SELECT ${customerId}, ${customerName}, 0, ${createdAt}
        WHERE NOT EXISTS (SELECT 1 FROM cust_exist)
        RETURNING id, name
      ),
      cust AS (
        SELECT id, name FROM cust_exist
        UNION ALL
        SELECT id, name FROM cust_ins
      ),`
    : Prisma.sql``;

  const supSql =
    input.createSupplier && supplierName && supplierId
      ? Prisma.sql`
      sup_exist AS (
        SELECT id, name FROM "Supplier" WHERE name = ${supplierName} LIMIT 1
      ),
      sup_ins AS (
        INSERT INTO "Supplier" (id, name, "openingBalance", "createdAt", "updatedAt")
        SELECT ${supplierId}, ${supplierName}, 0, ${createdAt}, ${createdAt}
        WHERE NOT EXISTS (SELECT 1 FROM sup_exist)
        RETURNING id, name
      ),
      sup AS (
        SELECT id, name FROM sup_exist
        UNION ALL
        SELECT id, name FROM sup_ins
      ),`
      : Prisma.sql``;

  const customerRef = customerName ? Prisma.sql`(SELECT id FROM cust)` : Prisma.sql`NULL`;
  const supplierRef =
    input.createSupplier && supplierName
      ? Prisma.sql`(SELECT id FROM sup)`
      : supplierId
        ? Prisma.sql`${supplierId}`
        : Prisma.sql`NULL`;

  const itemValues = items.map(
    (item) => Prisma.sql`(
      ${item.id},
      ${item.itemName},
      ${item.quantity},
      ${item.unitPrice},
      ${item.vatType ?? null},
      ${item.total},
      ${item.productName ?? item.itemName},
      ${item.lineNote ?? null}
    )`,
  );

  const payValues = payments.map(
    (p) => Prisma.sql`(
      ${p.id},
      ${p.amount},
      ${p.paymentMethod},
      ${p.notes}
    )`,
  );

  const cfValues = cf.map(
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
      ${row.paymentId ?? null},
      ${row.expenseType ?? null}
    )`,
  );

  const paySql =
    payValues.length > 0
      ? Prisma.sql`,
      pays AS (
        INSERT INTO "Payment" (id, "customerId", "documentId", amount, "paymentMethod", notes)
        SELECT v.id, doc."customerId", doc.id, v.amount, v."paymentMethod", v.notes
        FROM doc
        CROSS JOIN (VALUES ${Prisma.join(payValues)}) AS v(id, amount, "paymentMethod", notes)
        WHERE doc."customerId" IS NOT NULL
      )`
      : Prisma.sql``;

  const cfSql = cfValues.length
    ? Prisma.sql`,
      cf AS (
        INSERT INTO "CashFlowEntry" (
          id, "entryType", amount, description, "relatedDocumentId", "entryDate",
          "isDirect", "customerName", notes, "paymentMethod", "documentId",
          "customerId", "paymentId", "expenseType"
        )
        SELECT
          v.id, v."entryType", v.amount, v.description, v."relatedDocumentId", v."entryDate",
          v."isDirect", v."customerName", v.notes, v."paymentMethod", doc.id,
          doc."customerId", v."paymentId", v."expenseType"
        FROM doc
        CROSS JOIN (VALUES ${Prisma.join(cfValues)}) AS v(
          id, "entryType", amount, description, "relatedDocumentId", "entryDate",
          "isDirect", "customerName", notes, "paymentMethod", "paymentId", "expenseType"
        )
      )`
    : Prisma.sql``;

  const ledSql = ledger
    ? Prisma.sql`,
      led AS (
        INSERT INTO "LedgerEntry" (
          id, "entryDate", "docType", description, debit, credit,
          "supplierId", "employeeId", "financialDocumentId"
        )
        SELECT
          ${newFinanceRowId()},
          ${ledger.entryDate}::date,
          ${ledger.docType},
          ${ledger.description},
          ${ledger.debit},
          ${ledger.credit},
          ${ledger.supplierId},
          ${ledger.employeeId},
          doc.id
        FROM doc
      )`
    : Prisma.sql``;

  const rows = await prisma.$queryRaw<Array<{ id: string; customerId: string | null; supplierId: string | null }>>`
    WITH ${custSql}
    ${supSql}
    doc AS (
      INSERT INTO "FinancialDocument" (
        id, title, category, "documentType", "customerId", "supplierId", "employeeId",
        "totalAmount", "paidAmount", "remainingAmount", "paymentStatus",
        notes, metadata, "docDate", "pdfStoragePath", "sentToCpa",
        "depositAmount", "depositType", "depositNote", "depositStatus", "createdAt"
      )
      VALUES (
        ${docId},
        ${input.title},
        ${input.category},
        ${input.documentType},
        ${customerRef},
        ${supplierRef},
        ${input.employeeId},
        ${input.calculatedTotal},
        ${totals.paid},
        ${totals.remaining},
        ${totals.paymentStatus},
        ${notes},
        ${meta}::jsonb,
        ${input.docDate}::date,
        NULL,
        false,
        ${input.depositAmount},
        ${input.depositAmount > 0 ? input.ie.depositType?.trim() || null : null},
        ${input.depositAmount > 0 ? input.ie.depositNote?.trim() || null : null},
        ${input.depositAmount > 0 ? input.ie.depositStatus || "open" : "open"},
        ${createdAt}
      )
      RETURNING id, "customerId", "supplierId"
    ),
    items AS (
      INSERT INTO "FinancialDocumentItem" (
        id, "documentId", "itemName", quantity, "unitPrice", "vatType", total, "productName", "lineNote"
      )
      SELECT v.id, doc.id, v."itemName", v.quantity, v."unitPrice", v."vatType", v.total, v."productName", v."lineNote"
      FROM doc
      CROSS JOIN (VALUES ${Prisma.join(itemValues)}) AS v(
        id, "itemName", quantity, "unitPrice", "vatType", total, "productName", "lineNote"
      )
    )
    ${paySql}
    ${cfSql}
    ${ledSql}
    SELECT id, "customerId", "supplierId" FROM doc
  `;

  const row = rows[0];
  if (!row) throw new Error("לא נשמר המסמך");
  return { id: row.id, customerId: row.customerId, supplierId: row.supplierId };
}

function buildExpenseLedgerRow(input: {
  documentId: string;
  category: string;
  documentType: string;
  title: string;
  notes: string | null;
  totalAmount: number;
  paidAmount: number;
  docDate: Date | null;
  createdAt: Date;
  ie: IncomeExpensePayload;
  supplierId: string | null;
  employeeId: string | null;
}): {
  entryDate: Date;
  docType: string;
  description: string;
  debit: number;
  credit: number;
  supplierId: string | null;
  employeeId: string | null;
} | null {
  if (input.category.trim() !== "הוצאה" || input.ie.kind !== "expense") return null;
  const amounts = supplierLedgerAmounts(
    input.totalAmount,
    appliedExpensePaid({ total: input.totalAmount, storedPaid: input.paidAmount, payload: input.ie }),
  );
  if (amounts.debit < 1e-6 && amounts.credit < 1e-6) return null;
  const entryDate = input.docDate ?? input.createdAt;
  const expenseType = normalizeExpenseType(input.ie.expenseType);
  const note = input.notes?.trim();
  const baseDesc = input.title.trim() || input.documentType;
  const description = note ? `${baseDesc} — ${note}` : baseDesc;
  if (expenseType === "SUPPLIER_PAYMENTS" && input.supplierId) {
    const remaining = expenseOpenRemaining({
      total: input.totalAmount,
      storedPaid: input.paidAmount,
      payload: input.ie,
    });
    if (!paymentLinesHaveTypedAmount(input.ie) && remaining <= 1e-9) return null;
    return {
      entryDate,
      docType: input.documentType,
      description,
      debit: amounts.debit,
      credit: amounts.credit,
      supplierId: input.supplierId,
      employeeId: null,
    };
  }
  if (expenseType === "WORKER_PAYMENTS" && input.employeeId) {
    const payType = normalizeEmployeePayType(input.ie.employeePayType);
    return {
      entryDate,
      docType: documentTypeForEmployeePay(payType),
      description,
      debit: 0,
      credit: amounts.debit,
      supplierId: null,
      employeeId: input.employeeId,
    };
  }
  return null;
}
