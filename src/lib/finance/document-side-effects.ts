import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseNum } from "@/lib/format-shekel";
import {
  incomeExpenseDepositAmount,
  parsePayload,
  type IncomeExpensePayload,
  type PaymentLinePayload,
} from "@/lib/finance/document-payload";

/** תזרים לפי דוח Z — פירוט לפי מזומן / אשראי / העברה; סימון source=z_report וקישור zReportId. */
export async function syncZReportCashFlowEntries(documentId: string): Promise<void> {
  const doc = await prisma.financialDocument.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      documentType: true,
      title: true,
      totalAmount: true,
      metadata: true,
      docDate: true,
      createdAt: true,
    },
  });
  if (!doc || doc.documentType !== "דוח Z") return;

  const meta = parsePayload(doc.metadata as unknown);
  if (!meta || meta.kind !== "zreport") return;

  const z = meta;
  const cashSum = Math.max(0, z.cashTaxable + z.cashExempt);
  const creditSum = Math.max(0, z.creditTaxable + z.creditExempt);
  const transferSum = Math.max(0, z.transfers);
  const docTotal = Math.max(0, Number(doc.totalAmount) || 0);

  await prisma.cashFlowEntry.deleteMany({
    where: {
      OR: [{ zReportId: documentId }, { AND: [{ documentId }, { source: "z_report" }] }],
    },
  });

  const entryDate = doc.docDate ?? doc.createdAt;
  const baseTitle = doc.title.trim() || "דוח Z";

  type ZLine = { amount: number; paymentMethod: string; description: string };
  const lines: ZLine[] = [];

  const eps = 1e-9;
  if (cashSum > eps) {
    lines.push({
      amount: cashSum,
      paymentMethod: "CASH",
      description: `דוח Z · מזומן — ${baseTitle}`,
    });
  }
  if (creditSum > eps) {
    lines.push({
      amount: creditSum,
      paymentMethod: "CREDIT",
      description: `דוח Z · אשראי — ${baseTitle}`,
    });
  }
  if (transferSum > eps) {
    lines.push({
      amount: transferSum,
      paymentMethod: "BANK",
      description: `דוח Z · העברה — ${baseTitle}`,
    });
  }

  if (!lines.length && docTotal > eps) {
    lines.push({
      amount: docTotal,
      paymentMethod: "cash_register",
      description: `דוח Z קופה — ${baseTitle}`,
    });
  }

  if (!lines.length) return;

  await prisma.cashFlowEntry.createMany({
    data: lines.map((line) => ({
      entryType: "income",
      amount: line.amount,
      description: line.description,
      paymentMethod: line.paymentMethod,
      source: "z_report",
      zReportId: documentId,
      documentId,
      relatedDocumentId: documentId,
      entryDate,
      isDirect: false,
      customerId: null,
      customerName: null,
      notes: null,
      paymentId: null,
    })),
  });
}

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

export async function saveProductHistoryFromItems(items: { itemName: string }[]): Promise<void> {
  const names = Array.from(
    new Set(items.map((item) => item.itemName.trim()).filter((name) => name.length > 0)),
  );
  if (!names.length) return;

  await Promise.all(
    names.map(async (name) => {
      await prisma.product.upsert({
        where: { name },
        update: {},
        create: { name },
      });
      await prisma.productHistory.upsert({
        where: { itemName: name },
        update: {},
        create: { itemName: name },
      });
    }),
  );
}

export async function attachProductsToItems<
  T extends { itemName: string; productId?: string | null; productName?: string | null },
>(items: T[]): Promise<T[]> {
  return Promise.all(
    items.map(async (item) => {
      const name = item.itemName.trim();
      if (!name) return item;
      const product = await prisma.product.upsert({
        where: { name },
        update: {},
        create: { name },
      });
      return {
        ...item,
        productId: product.id,
        productName: product.name,
      };
    }),
  );
}

const CF_EPS = 1e-9;

/** גודל סכום חיובי לשמירה ב־DB לפי סוג התנועה (ללא Math.abs כללי). */
function cashFlowMagnitude(raw: number): number {
  if (!Number.isFinite(raw)) return 0;
  return raw >= 0 ? raw : -raw;
}

export async function replaceCashFlowForDocument(documentId: string): Promise<void> {
  const doc = await prisma.financialDocument.findUnique({
    where: { id: documentId },
    include: {
      customer: { select: { name: true } },
      payments: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!doc) return;

  if (doc.documentType === "דוח Z") {
    await syncZReportCashFlowEntries(documentId);
    return;
  }

  await prisma.cashFlowEntry.deleteMany({
    where: {
      isDirect: false,
      OR: [{ documentId }, { relatedDocumentId: documentId }],
    },
  });

  const entryDate = doc.docDate ?? doc.createdAt;
  const customerName = doc.customer?.name ?? null;
  const customerId = doc.customerId ?? null;
  const data: Prisma.CashFlowEntryCreateManyInput[] = [];

  const metaParsed = parsePayload(doc.metadata as unknown);
  const cat = doc.category.trim();
  const isExpenseDoc = cat === "הוצאה" || metaParsed?.kind === "expense";
  const isIncomeRegister =
    cat === "הכנסה" && doc.documentType !== "דוח Z" && !isExpenseDoc;
  const parsedDepositAmount =
    metaParsed?.kind === "income" || metaParsed?.kind === "expense"
      ? incomeExpenseDepositAmount(metaParsed)
      : 0;

  if (isExpenseDoc) {
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
        });
      }
    } else {
      const mag = cashFlowMagnitude(doc.totalAmount);
      if (mag <= CF_EPS) return;
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
            entryDate: p.createdAt,
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
              metaParsed?.kind === "income"
                ? metaParsed.depositNote?.trim() || p.notes
                : p.notes,
            paymentId: p.id,
            documentId,
            relatedDocumentId: documentId,
            entryDate: p.createdAt,
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
        if (mag <= CF_EPS) return;
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

  if (data.length) {
    await prisma.cashFlowEntry.createMany({ data });
  }
}

export async function syncCashFlowForPayment(paymentId: string): Promise<void> {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      customer: { select: { id: true, name: true } },
      document: { select: { id: true, documentType: true, title: true } },
    },
  });

  await prisma.cashFlowEntry.deleteMany({
    where: { isDirect: false, paymentId },
  });

  if (!payment) return;
  const payMag = cashFlowMagnitude(payment.amount);
  if (payMag <= CF_EPS) return;

  await prisma.cashFlowEntry.create({
    data: {
      entryType: "income",
      amount: payMag,
      description: payment.document
        ? `תשלום עבור ${payment.document.documentType}`
        : "תשלום לקוח",
      paymentMethod: payment.paymentMethod,
      customerId: payment.customerId,
      customerName: payment.customer?.name ?? null,
      notes: payment.notes,
      paymentId: payment.id,
      documentId: payment.documentId,
      relatedDocumentId: payment.documentId,
      entryDate: payment.createdAt,
      isDirect: false,
    },
  });
}
