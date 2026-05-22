import { prisma } from "@/lib/prisma";
import { documentTypeForEmployeePay, normalizeEmployeePayType } from "@/lib/finance/employee-pay-types";
import { parsePayload } from "@/lib/finance/document-payload";
import { normalizeExpenseType } from "@/lib/finance/expense-types";

/**
 * יוצר/מעדכן שורת כרטסת אחת למסמך הוצאה (ספק או עובד).
 * לא נוגע ברישומים ידניים ללא financialDocumentId.
 */
export async function syncExpenseDocumentLedgerEntry(documentId: string): Promise<void> {
  await prisma.ledgerEntry.deleteMany({ where: { financialDocumentId: documentId } });

  const doc = await prisma.financialDocument.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      category: true,
      documentType: true,
      title: true,
      totalAmount: true,
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

  const amount = Math.max(0, Number(doc.totalAmount) || 0);
  if (amount < 1e-6) return;

  const entryDate = doc.docDate ?? doc.createdAt;
  const expenseType = normalizeExpenseType(meta.expenseType);
  const note = doc.notes?.trim();
  const baseDesc = doc.title.trim() || doc.documentType;
  const description = note ? `${baseDesc} — ${note}` : baseDesc;

  if (expenseType === "SUPPLIER_PAYMENTS" && doc.supplierId) {
    await prisma.ledgerEntry.create({
      data: {
        financialDocumentId: documentId,
        supplierId: doc.supplierId,
        entryDate,
        docType: doc.documentType,
        description,
        debit: 0,
        credit: amount,
      },
    });
    return;
  }

  if (expenseType === "WORKER_PAYMENTS" && doc.employeeId) {
    const payType = normalizeEmployeePayType(meta.employeePayType);
    await prisma.ledgerEntry.create({
      data: {
        financialDocumentId: documentId,
        employeeId: doc.employeeId,
        entryDate,
        docType: documentTypeForEmployeePay(payType),
        description,
        debit: 0,
        credit: amount,
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
