import type { Prisma } from "@prisma/client";
import { parseNum } from "@/lib/format-shekel";
import {
  incomeExpenseDepositAmount,
  parsePayload,
  type IncomeExpensePayload,
  type PaymentLinePayload,
  type ZReportPayload,
} from "@/lib/finance/document-payload";
import { normalizeExpenseType } from "@/lib/finance/expense-types";

export const CF_EPS = 1e-9;

export function normalizedPaymentLines(payload: IncomeExpensePayload): PaymentLinePayload[] {
  const rows = payload.payments?.length
    ? payload.payments
    : payload.paymentMethods?.length
      ? payload.paymentMethods
      : [
          {
            id: "legacy-payment",
            instrument: payload.paymentInstrument,
            amount: payload.paymentPaidAmount,
            notes: payload.paymentNotes,
          },
        ];

  return rows
    .map((row) => ({
      ...row,
      instrument: row.instrument?.trim() || "מזומן",
      amount: String(row.amount ?? ""),
      notes: row.notes?.trim() || "",
    }))
    .filter((row) => parseNum(row.amount) > 0);
}

/** גודל סכום חיובי לשמירה ב־DB לפי סוג התנועה (ללא Math.abs כללי). */
export function cashFlowMagnitude(raw: number): number {
  if (!Number.isFinite(raw)) return 0;
  return raw >= 0 ? raw : -raw;
}

function expenseTypeForDocument(meta: ReturnType<typeof parsePayload>): string | null {
  if (meta?.kind !== "expense") return null;
  return normalizeExpenseType(meta.expenseType);
}

export type CashFlowPaymentInput = {
  id: string;
  amount: number;
  paymentMethod: string | null;
  notes: string | null;
};

export type CashFlowDocumentInput = {
  id: string;
  documentType: string;
  title: string;
  category: string;
  totalAmount: number;
  notes: string | null;
  metadata: unknown;
  docDate: Date | null;
  createdAt: Date;
  customerId: string | null;
  customerName: string | null;
  payments: CashFlowPaymentInput[];
};

export type ComparableCashFlowRow = {
  entryType: string;
  amount: number;
  description: string | null;
  paymentMethod: string | null;
  customerId: string | null;
  customerName: string | null;
  notes: string | null;
  paymentId: string | null;
  documentId: string | null;
  relatedDocumentId: string | null;
  entryDate: string;
  isDirect: boolean;
  expenseType: string | null;
};

/** Same allocation as replaceCashFlowForDocument — no formula change. */
export function buildCashFlowRowsForDocument(
  doc: CashFlowDocumentInput,
): Prisma.CashFlowEntryCreateManyInput[] {
  const documentId = doc.id;
  const entryDate = doc.docDate ?? doc.createdAt;
  const customerName = doc.customerName ?? null;
  const customerId = doc.customerId ?? null;
  const data: Prisma.CashFlowEntryCreateManyInput[] = [];

  const metaParsed = parsePayload(doc.metadata as unknown);
  const cat = doc.category.trim();
  const isExpenseDoc = cat === "הוצאה" || metaParsed?.kind === "expense";
  const isIncomeRegister = cat === "הכנסה" && doc.documentType !== "דוח Z" && !isExpenseDoc;
  const parsedDepositAmount =
    metaParsed?.kind === "income" || metaParsed?.kind === "expense"
      ? incomeExpenseDepositAmount(metaParsed)
      : 0;

  if (isExpenseDoc) {
    const docExpenseType = expenseTypeForDocument(metaParsed);
    const expensePayments =
      metaParsed?.kind === "expense" ? normalizedPaymentLines(metaParsed) : [];
    if (expensePayments.length > 0) {
      for (const payment of expensePayments) {
        const amt = cashFlowMagnitude(parseNum(payment.amount));
        if (amt <= CF_EPS) continue;
        data.push({
          entryType: "expense",
          amount: amt,
          description: `יציאה (חובה) עבור ${doc.documentType} ${doc.title}`,
          paymentMethod: payment.instrument.trim() || null,
          customerId,
          customerName,
          notes: payment.notes.trim() || doc.notes,
          documentId,
          relatedDocumentId: documentId,
          entryDate,
          isDirect: false,
          expenseType: docExpenseType,
        });
      }
    } else {
      const mag = cashFlowMagnitude(doc.totalAmount);
      if (mag <= CF_EPS) return data;
      data.push({
        entryType: "expense",
        amount: mag,
        description: `יציאה (חובה) ${doc.documentType} ${doc.title}`,
        paymentMethod: null,
        customerId,
        customerName,
        notes: doc.notes,
        documentId,
        relatedDocumentId: documentId,
        entryDate,
        isDirect: false,
        expenseType: docExpenseType,
      });
    }
  }

  if (isIncomeRegister) {
    const hasPayments = doc.payments.some((p) => cashFlowMagnitude(p.amount) > CF_EPS);
    if (hasPayments) {
      const productAmount = Math.max(0, doc.totalAmount - parsedDepositAmount);
      let remainingProduct = productAmount;
      let remainingDeposit = parsedDepositAmount;
      for (const p of doc.payments) {
        const amt = cashFlowMagnitude(p.amount);
        if (amt <= CF_EPS) continue;
        const incomePart = Math.min(amt, remainingProduct);
        const depositPart = Math.min(Math.max(0, amt - incomePart), remainingDeposit);
        remainingProduct -= incomePart;
        remainingDeposit -= depositPart;
        if (incomePart > CF_EPS) {
          data.push({
            entryType: "income",
            amount: incomePart,
            description: `כניסה (זכות) עבור ${doc.documentType} ${doc.title}`,
            paymentMethod: p.paymentMethod,
            customerId,
            customerName,
            notes: p.notes,
            paymentId: p.id,
            documentId,
            relatedDocumentId: documentId,
            entryDate,
            isDirect: false,
          });
        }
        if (depositPart > CF_EPS) {
          data.push({
            entryType: "deposit",
            amount: depositPart,
            description: `פיקדון ${doc.title}`,
            paymentMethod: p.paymentMethod,
            customerId,
            customerName,
            notes:
              metaParsed?.kind === "income" ? metaParsed.depositNote?.trim() || p.notes : p.notes,
            paymentId: p.id,
            documentId,
            relatedDocumentId: documentId,
            entryDate,
            isDirect: false,
          });
        }
      }
    } else {
      const incomePayments =
        metaParsed?.kind === "income" ? normalizedPaymentLines(metaParsed) : [];
      if (incomePayments.length > 0) {
        const productAmount = Math.max(0, doc.totalAmount - parsedDepositAmount);
        let remainingProduct = productAmount;
        let remainingDeposit = parsedDepositAmount;
        for (const payment of incomePayments) {
          const amt = cashFlowMagnitude(parseNum(payment.amount));
          if (amt <= CF_EPS) continue;
          const incomePart = Math.min(amt, remainingProduct);
          const depositPart = Math.min(Math.max(0, amt - incomePart), remainingDeposit);
          remainingProduct -= incomePart;
          remainingDeposit -= depositPart;
          if (incomePart > CF_EPS) {
            data.push({
              entryType: "income",
              amount: incomePart,
              description: `כניסה (זכות) עבור ${doc.documentType} ${doc.title}`,
              paymentMethod: payment.instrument.trim() || null,
              customerId,
              customerName,
              notes: payment.notes.trim() || doc.notes,
              paymentId: null,
              documentId,
              relatedDocumentId: documentId,
              entryDate,
              isDirect: false,
            });
          }
          if (depositPart > CF_EPS) {
            data.push({
              entryType: "deposit",
              amount: depositPart,
              description: `פיקדון ${doc.title}`,
              paymentMethod: payment.instrument.trim() || null,
              customerId,
              customerName,
              notes:
                metaParsed?.kind === "income"
                  ? metaParsed.depositNote?.trim() || payment.notes.trim() || doc.notes
                  : payment.notes.trim() || doc.notes,
              paymentId: null,
              documentId,
              relatedDocumentId: documentId,
              entryDate,
              isDirect: false,
            });
          }
        }
      } else {
        const mag = cashFlowMagnitude(Math.max(0, doc.totalAmount - parsedDepositAmount));
        if (mag <= CF_EPS) return data;
        data.push({
          entryType: "income",
          amount: mag,
          description: `כניסה (זכות) ${doc.documentType} ${doc.title}`,
          paymentMethod: null,
          customerId,
          customerName,
          notes: doc.notes,
          paymentId: null,
          documentId,
          relatedDocumentId: documentId,
          entryDate,
          isDirect: false,
        });
      }
    }
  }

  return data;
}

export function comparableCashFlowRows(
  rows: Prisma.CashFlowEntryCreateManyInput[],
): ComparableCashFlowRow[] {
  return rows
    .map((row) => ({
      entryType: String(row.entryType),
      amount: Number(row.amount),
      description: row.description ?? null,
      paymentMethod: row.paymentMethod ?? null,
      customerId: row.customerId ?? null,
      customerName: row.customerName ?? null,
      notes: row.notes ?? null,
      paymentId: row.paymentId ?? null,
      documentId: row.documentId ?? null,
      relatedDocumentId: row.relatedDocumentId ?? null,
      entryDate:
        row.entryDate instanceof Date
          ? row.entryDate.toISOString().slice(0, 10)
          : String(row.entryDate).slice(0, 10),
      isDirect: Boolean(row.isDirect),
      expenseType: row.expenseType ?? null,
    }))
    .sort((a, b) =>
      `${a.entryType}|${a.paymentId}|${a.amount}|${a.description}`.localeCompare(
        `${b.entryType}|${b.paymentId}|${b.amount}|${b.description}`,
      ),
    );
}

/** Incremental add of payment P equals full rebuild when prior CF was engine-synced. */
export function buildZCashFlowRows(input: {
  documentId: string;
  title: string;
  totalAmount: number;
  docDate: Date | null;
  createdAt: Date;
  z: ZReportPayload;
}): Prisma.CashFlowEntryCreateManyInput[] {
  const cashSum = Math.max(0, input.z.cashTaxable + input.z.cashExempt);
  const creditSum = Math.max(0, input.z.creditTaxable + input.z.creditExempt);
  const transferSum = Math.max(0, input.z.transfers);
  const docTotal = Math.max(0, Number(input.totalAmount) || 0);
  const entryDate = input.docDate ?? input.createdAt;
  const baseTitle = input.title.trim() || "דוח Z";
  const lines: Prisma.CashFlowEntryCreateManyInput[] = [];
  if (cashSum > CF_EPS) {
    lines.push({
      entryType: "income",
      amount: cashSum,
      description: `דוח Z · מזומן — ${baseTitle}`,
      paymentMethod: "CASH",
      source: "z_report",
      zReportId: input.documentId,
      documentId: input.documentId,
      relatedDocumentId: input.documentId,
      entryDate,
      isDirect: false,
    });
  }
  if (creditSum > CF_EPS) {
    lines.push({
      entryType: "income",
      amount: creditSum,
      description: `דוח Z · אשראי — ${baseTitle}`,
      paymentMethod: "CREDIT",
      source: "z_report",
      zReportId: input.documentId,
      documentId: input.documentId,
      relatedDocumentId: input.documentId,
      entryDate,
      isDirect: false,
    });
  }
  if (transferSum > CF_EPS) {
    lines.push({
      entryType: "income",
      amount: transferSum,
      description: `דוח Z · העברה — ${baseTitle}`,
      paymentMethod: "BANK",
      source: "z_report",
      zReportId: input.documentId,
      documentId: input.documentId,
      relatedDocumentId: input.documentId,
      entryDate,
      isDirect: false,
    });
  }
  if (!lines.length && docTotal > CF_EPS) {
    lines.push({
      entryType: "income",
      amount: docTotal,
      description: `דוח Z קופה — ${baseTitle}`,
      paymentMethod: "cash_register",
      source: "z_report",
      zReportId: input.documentId,
      documentId: input.documentId,
      relatedDocumentId: input.documentId,
      entryDate,
      isDirect: false,
    });
  }
  return lines;
}

export function incrementalRowsForAddedPayment(
  before: CashFlowDocumentInput,
  added: CashFlowPaymentInput,
): { rebuildAll: ComparableCashFlowRow[]; incrementalOnly: ComparableCashFlowRow[]; firstPayment: boolean } {
  const firstPayment = !before.payments.some((p) => cashFlowMagnitude(p.amount) > CF_EPS);
  const rebuildBefore = comparableCashFlowRows(buildCashFlowRowsForDocument(before));
  const rebuildAll = comparableCashFlowRows(
    buildCashFlowRowsForDocument({ ...before, payments: [...before.payments, added] }),
  );
  const beforeKeys = new Set(
    rebuildBefore.map((r) => `${r.entryType}|${r.paymentId}|${r.amount}|${r.description}`),
  );
  const incrementalOnly = rebuildAll.filter(
    (r) => !beforeKeys.has(`${r.entryType}|${r.paymentId}|${r.amount}|${r.description}`),
  );
  return { rebuildAll, incrementalOnly, firstPayment };
}
