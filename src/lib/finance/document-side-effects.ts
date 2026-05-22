import type { Prisma } from "@prisma/client";
import { prisma, prismaAny } from "@/lib/prisma";
import { parseNum } from "@/lib/format-shekel";
import {
  incomeExpenseDepositAmount,
  parsePayload,
  type IncomeExpensePayload,
  type PaymentLinePayload,
} from "@/lib/finance/document-payload";
import { normalizeExpenseType } from "@/lib/finance/expense-types";

function expenseTypeForDocument(meta: ReturnType<typeof parsePayload>): string | null {
  if (meta?.kind !== "expense") return null;
  return normalizeExpenseType(meta.expenseType);
}

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

/**
 * Sync CheckPayment rows for a financial document.
 *
 * - For each payment line on the document with `paymentMethod === "CHECK"` and
 *   embedded check details, ensure a corresponding `CheckPayment` row exists
 *   (linked by paymentId + documentId).
 * - Existing rows are updated in-place (no duplicates on edit).
 * - Removed payment lines: the orphan CheckPayment rows that are still in
 *   `PENDING` (not yet actioned) are deleted; rows with progressed status
 *   (DEPOSITED/CLEARED/BOUNCED/CANCELLED) are preserved as audit history.
 *
 * Robust to the "no counterparty name" case: if the document has check lines
 * but no customer link, a fallback customer is created from the counterparty
 * name (or "ללא לקוח" if empty) so the check row can still be tracked.
 */
export async function syncCheckPaymentsForDocument(documentId: string): Promise<void> {
  const doc = await prisma.financialDocument.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      customerId: true,
      category: true,
      metadata: true,
      payments: {
        select: {
          id: true,
          amount: true,
          paymentMethod: true,
          notes: true,
          customerId: true,
          createdAt: true,
        },
      },
    },
  });
  if (!doc) return;

  const meta = parsePayload(doc.metadata as unknown);
  // Only auto-create check rows for income flows. Accept both Hebrew and
  // English category labels just in case.
  const isIncome =
    meta?.kind === "income" &&
    (doc.category === "הכנסה" || doc.category.toLowerCase() === "income");

  if (!isIncome) {
    await deleteOrphanCheckRowsForDocument(documentId, []);
    return;
  }

  const meta2 = meta as IncomeExpensePayload;
  const checkLines = (meta2.payments ?? [])
    .filter((line) => line.instrument === "CHECK" && line.check)
    .map((line) => ({ line, check: line.check! }));

  if (checkLines.length === 0) {
    await deleteOrphanCheckRowsForDocument(documentId, []);
    return;
  }

  // Resolve a customerId — required by CheckPayment FK. Order of preference:
  //   1. doc.customerId (already linked)
  //   2. existing Payment.customerId (Payment was created earlier)
  //   3. ensureCustomerByName(counterpartyName)
  //   4. ensureCustomerByName(check.holderName) (first check holder)
  //   5. fallback "ללא לקוח" customer
  let customerId: string | null = doc.customerId ?? null;
  if (!customerId) {
    customerId = doc.payments.find((p) => p.customerId)?.customerId ?? null;
  }
  if (!customerId) {
    const candidate = meta2.counterpartyName.trim();
    if (candidate) customerId = await ensureCustomerByName(candidate);
  }
  if (!customerId) {
    const holder = checkLines.find((c) => c.check.holderName.trim())?.check.holderName ?? "";
    if (holder.trim()) customerId = await ensureCustomerByName(holder.trim());
  }
  if (!customerId) {
    customerId = await ensureCustomerByName("ללא לקוח");
  }

  // If we now have a customer and the doc didn't have one before, link them.
  if (customerId && !doc.customerId) {
    try {
      await prisma.financialDocument.update({
        where: { id: documentId },
        data: { customerId },
      });
    } catch (e) {
      console.error("[syncCheckPaymentsForDocument] failed to link customer", e);
    }
  }

  if (!customerId) {
    console.error(
      "[syncCheckPaymentsForDocument] no customerId resolvable for doc",
      documentId,
    );
    await deleteOrphanCheckRowsForDocument(documentId, []);
    return;
  }

  // Map payment payload id -> Payment DB row id (best-effort: payments were
  // re-created on edit so we just take them in order, since payments table
  // doesn't store the payload `id`).
  const dbPayments = [...doc.payments].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  const dbCheckPayments = dbPayments.filter((p) => p.paymentMethod === "CHECK");
  const checkPaymentsInOrder = (meta2.payments ?? []).filter(
    (p) => p.instrument === "CHECK",
  );
  const paymentIdByPayloadId = new Map<string, string>();
  for (let i = 0; i < checkPaymentsInOrder.length; i++) {
    const dbRow = dbCheckPayments[i] ?? dbPayments[i];
    if (dbRow) paymentIdByPayloadId.set(checkPaymentsInOrder[i].id, dbRow.id);
  }

  // Existing CheckPayment rows linked to this document
  const existing = (await prismaAny.checkPayment.findMany({
    where: { documentId },
    select: {
      id: true,
      paymentId: true,
      checkNumber: true,
      status: true,
    },
  })) as Array<{
    id: string;
    paymentId: string | null;
    checkNumber: string;
    status: string;
  }>;

  const keepIds = new Set<string>();
  const eps = 1e-9;

  for (const { line, check } of checkLines) {
    if (!check.checkNumber.trim() || !check.bankName.trim() || !check.dueDate.trim()) {
      // Skip incomplete check details — UI should validate, but be defensive.
      continue;
    }
    const due = new Date(check.dueDate);
    if (!Number.isFinite(due.getTime())) continue;
    const amount = Math.max(0, parseNum(line.amount));
    if (amount <= eps) continue;
    const paymentId = paymentIdByPayloadId.get(line.id) ?? null;

    // Find existing row by paymentId first (most reliable), else by checkNumber.
    let match = paymentId
      ? existing.find((r) => r.paymentId === paymentId && !keepIds.has(r.id))
      : null;
    if (!match) {
      match = existing.find(
        (r) => r.checkNumber === check.checkNumber.trim() && !keepIds.has(r.id),
      );
    }

    if (match) {
      keepIds.add(match.id);
      try {
        await prismaAny.checkPayment.update({
          where: { id: match.id },
          data: {
            customerId,
            paymentId,
            documentId,
            checkNumber: check.checkNumber.trim(),
            bankName: check.bankName.trim(),
            branch: check.branch.trim() || null,
            amount,
            dueDate: due,
            notes: buildCheckNotes(check.holderName, line.notes),
          },
        });
      } catch (e) {
        console.error("[syncCheckPaymentsForDocument] update failed", {
          documentId,
          checkId: match.id,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    } else {
      try {
        const created = (await prismaAny.checkPayment.create({
          data: {
            customerId,
            paymentId,
            documentId,
            checkNumber: check.checkNumber.trim(),
            bankName: check.bankName.trim(),
            branch: check.branch.trim() || null,
            amount,
            dueDate: due,
            notes: buildCheckNotes(check.holderName, line.notes),
            status: "PENDING",
          },
          select: { id: true },
        })) as { id: string };
        keepIds.add(created.id);
      } catch (e) {
        console.error("[syncCheckPaymentsForDocument] create failed", {
          documentId,
          checkNumber: check.checkNumber,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }

  await deleteOrphanCheckRowsForDocument(documentId, Array.from(keepIds));
}

/**
 * Ensure a customer exists by name (idempotent). Internal helper for the
 * check-sync fallback flow; matches the behavior of the same helper in the
 * documents API.
 */
async function ensureCustomerByName(name: string): Promise<string | null> {
  const n = name.trim();
  if (!n) return null;
  const found = await prisma.customer.findFirst({ where: { name: n } });
  if (found) return found.id;
  const c = await prisma.customer.create({ data: { name: n } });
  return c.id;
}

function buildCheckNotes(holderName: string, notes: string): string | null {
  const parts: string[] = [];
  if (holderName.trim()) parts.push(`Holder: ${holderName.trim()}`);
  if (notes.trim()) parts.push(notes.trim());
  return parts.length ? parts.join(" | ") : null;
}

async function deleteOrphanCheckRowsForDocument(
  documentId: string,
  keepIds: string[],
): Promise<void> {
  try {
    await prismaAny.checkPayment.deleteMany({
      where: {
        documentId,
        status: "PENDING",
        ...(keepIds.length > 0 ? { NOT: { id: { in: keepIds } } } : {}),
      },
    });
  } catch {
    /* ignore */
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
