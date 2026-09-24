import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type Db = Prisma.TransactionClient | PrismaClient;

export function supplierLedgerAmounts(totalAmount: number, paidAmount: number): { debit: number; credit: number } {
  const debit = Math.max(0, Number(totalAmount) || 0);
  const credit = Math.min(debit, Math.max(0, Number(paidAmount) || 0));
  return { debit, credit };
}
import { documentTypeForEmployeePay, normalizeEmployeePayType } from "@/lib/finance/employee-pay-types";
import { parsePayload } from "@/lib/finance/document-payload";
import { normalizeExpenseType } from "@/lib/finance/expense-types";

/**
 * יוצר/מעדכן שורת כרטסת אחת למסמך הוצאה (ספק או עובד).
 * לא נוגע ברישומים ידניים ללא financialDocumentId.
 */
export async function syncExpenseDocumentLedgerEntry(documentId: string, db: Db = prisma): Promise<void> {
  await db.ledgerEntry.deleteMany({ where: { financialDocumentId: documentId } });

  const doc = await db.financialDocument.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      category: true,
      documentType: true,
      title: true,
      totalAmount: true,
      paidAmount: true,
      docDate: true,
      createdAt: true,
      metadata: true,
      notes: true,
      supplierId: true,
      employeeId: true,
    },
  });

  if (!doc || doc.category.trim() !== "הוצאה") return;

  const meta = parsePayload(doc.metadata as unknown);
  if (!meta || meta.kind !== "expense") return;

  const amounts = supplierLedgerAmounts(doc.totalAmount, doc.paidAmount);
  if (amounts.debit < 1e-6 && amounts.credit < 1e-6) return;

  const entryDate = doc.docDate ?? doc.createdAt;
  const expenseType = normalizeExpenseType(meta.expenseType);
  const note = doc.notes?.trim();
  const baseDesc = doc.title.trim() || doc.documentType;
  const description = note ? `${baseDesc} — ${note}` : baseDesc;

  if (expenseType === "SUPPLIER_PAYMENTS" && doc.supplierId) {
    await db.ledgerEntry.create({
      data: {
        financialDocumentId: documentId,
        supplierId: doc.supplierId,
        entryDate,
        docType: doc.documentType,
        description,
        debit: amounts.debit,
        credit: amounts.credit,
      },
    });
    return;
  }

  if (expenseType === "WORKER_PAYMENTS" && doc.employeeId) {
    const payType = normalizeEmployeePayType(meta.employeePayType);
    await db.ledgerEntry.create({
      data: {
        financialDocumentId: documentId,
        employeeId: doc.employeeId,
        entryDate,
        docType: documentTypeForEmployeePay(payType),
        description,
        debit: 0,
        credit: amounts.debit,
      },
    });
  }
}

export function resolveExpenseDocumentLinks(meta: ReturnType<typeof parsePayload>): {
  supplierId: string | null;
  employeeId: string | null;
} {
  if (!meta || meta.kind !== "expense") {
    return { supplierId: null, employeeId: null };
  }
  const et = normalizeExpenseType(meta.expenseType);
  if (et === "SUPPLIER_PAYMENTS" && meta.supplierId?.trim()) {
    return { supplierId: meta.supplierId.trim(), employeeId: null };
  }
  if (et === "WORKER_PAYMENTS" && meta.employeeId?.trim()) {
    return { supplierId: null, employeeId: meta.employeeId.trim() };
  }
  return { supplierId: null, employeeId: null };
}
