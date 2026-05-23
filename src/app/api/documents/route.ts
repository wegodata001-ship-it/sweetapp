import { NextRequest, NextResponse } from "next/server";
import {
  buildItemsFromIncomeExpense,
  combineIncomeNotes,
  incomeExpenseDepositAmount,
  incomeExpenseGrandTotal,
  isWorkerExpensePayload,
  paymentLinesTotal,
  workerPayAmountNum,
  type FinanceDocumentPayload,
  type IncomeExpensePayload,
  type ZReportPayload,
} from "@/lib/finance/document-payload";
import { prismaDocToFinanceRow } from "@/lib/finance/map-document";
import { syncFinancialDocumentPaymentTotals } from "@/lib/finance/sync-document-amounts";
import {
  attachProductsToItems,
  normalizedPaymentLines,
  replaceCashFlowForDocument,
  saveProductHistoryFromItems,
  syncCheckPaymentsForDocument,
} from "@/lib/finance/document-side-effects";
import { documentTypeForEmployeePay, normalizeEmployeePayType } from "@/lib/finance/employee-pay-types";
import {
  resolveExpenseDocumentLinks,
  syncExpenseDocumentLedgerEntry,
} from "@/lib/finance/expense-ledger-sync";
import { normalizeExpenseType } from "@/lib/finance/expense-types";
import { recordSupplierPriceHistoryFromExpense } from "@/lib/procurement/record-expense-prices";
import { prisma, prismaAny } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { logActivity } from "@/lib/activity-log";
import { parseNum } from "@/lib/format-shekel";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function GET(req: NextRequest) {
  const block = await requireDb();
  if (block) return block;
  try {
    const { searchParams } = req.nextUrl;
    const accountant = searchParams.get("accountant"); // all | sent | not_sent
    const where: Record<string, unknown> = {};
    if (accountant === "sent") where.sentToCpa = true;
    else if (accountant === "not_sent") where.sentToCpa = false;

    const rows = await prismaAny.financialDocument.findMany({
      where,
      include: {
        customer: { select: { name: true } },
        payments: { select: { amount: true } },
        sentToCpaBy: { select: { id: true, fullName: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    const data = rows.map((r: Parameters<typeof prismaDocToFinanceRow>[0]) => prismaDocToFinanceRow(r));

    const totalCount = await prismaAny.financialDocument.count();
    const notSentCount = await prismaAny.financialDocument.count({ where: { sentToCpa: false } });
    const sentCount = totalCount - notSentCount;

    return NextResponse.json({
      ok: true,
      data,
      counts: { total: totalCount, sent: sentCount, notSent: notSentCount },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}

function zTotal(z: ZReportPayload): number {
  return z.cashTaxable + z.cashExempt + z.creditTaxable + z.creditExempt + z.transfers;
}

async function ensureCustomerByName(name: string): Promise<string | null> {
  const n = name.trim();
  if (!n) return null;
  const found = await prisma.customer.findFirst({ where: { name: n } });
  if (found) return found.id;
  const c = await prisma.customer.create({ data: { name: n } });
  return c.id;
}

export async function POST(req: NextRequest) {
  const block = await requireDb();
  if (block) return block;
  const session = await getSessionFromCookie();
  try {
    const body = (await req.json()) as {
      title: string;
      category: string;
      docDate: string | null;
      payload: FinanceDocumentPayload;
    };

    if (!body.title?.trim()) {
      return NextResponse.json({ ok: false, error: "חסר כותרת" }, { status: 400 });
    }

    const meta = body.payload;
    if (!meta) {
      return NextResponse.json({ ok: false, error: "חסר payload" }, { status: 400 });
    }

    if (meta.kind === "zreport") {
      const z = meta;
      const total = zTotal(z);
      const doc = await prisma.financialDocument.create({
        data: {
          title: body.title.trim(),
          category: body.category,
          documentType: "דוח Z",
          customerId: null,
          totalAmount: total,
          paidAmount: total,
          remainingAmount: 0,
          paymentStatus: total <= 0 ? "unpaid" : "paid",
          notes: null,
          metadata: asJson(meta),
          docDate: z.zDate ? new Date(z.zDate) : body.docDate ? new Date(body.docDate) : null,
          pdfStoragePath: null,
          sentToCpa: false,
        },
      });
      await replaceCashFlowForDocument(doc.id);
      if (session) await logActivity(session.sub, "document_create");
      return NextResponse.json({ ok: true, id: doc.id });
    }

    const ie = meta as IncomeExpensePayload;
    if (isWorkerExpensePayload(ie)) {
      if (!ie.employeeId?.trim()) {
        return NextResponse.json({ ok: false, error: "יש לבחור עובד" }, { status: 400 });
      }
      if (workerPayAmountNum(ie) < 1e-6) {
        return NextResponse.json({ ok: false, error: "יש להזין סכום לתשלום" }, { status: 400 });
      }
    }
    const items = buildItemsFromIncomeExpense(ie);
    const productTotal =
      items.reduce((s, r) => s + r.total, 0) || incomeExpenseGrandTotal(ie);
    const depositAmount = incomeExpenseDepositAmount(ie);
    const calculatedTotal = productTotal + depositAmount;

    let customerId =
      ie.kind === "income" ? await ensureCustomerByName(ie.counterpartyName) : null;

    // If income with CHECK payment lines but no counterparty, fall back to a
    // placeholder customer so the check can still be tracked.
    const hasCheckLine =
      ie.kind === "income" &&
      (ie.payments ?? []).some((p) => p.instrument === "CHECK");
    if (ie.kind === "income" && !customerId && hasCheckLine) {
      customerId = await ensureCustomerByName("ללא לקוח");
    }

    const isIncomeRegister = ie.kind === "income" && body.category === "הכנסה";
    const isIncomeExpenseDocument = ie.kind === "income" || ie.kind === "expense";
    const paidRaw = paymentLinesTotal(ie);

    if (isIncomeExpenseDocument) {
      if (paidRaw < -1e-6) {
        return NextResponse.json({ ok: false, error: "סכום תשלום לא יכול להיות שלילי" }, { status: 400 });
      }
      if (paidRaw > calculatedTotal + 1e-6) {
        return NextResponse.json(
          { ok: false, error: "סכום אמצעי התשלום לא יכול לעלות על סה״כ המסמך" },
          { status: 400 },
        );
      }
    }

    const itemsWithProducts = await attachProductsToItems(items);
    const expenseLinks = ie.kind === "expense" ? resolveExpenseDocumentLinks(ie) : { supplierId: null, employeeId: null };
    const docType =
      ie.kind === "expense" && normalizeExpenseType(ie.expenseType) === "WORKER_PAYMENTS"
        ? documentTypeForEmployeePay(normalizeEmployeePayType(ie.employeePayType))
        : ie.documentType;

    const doc = await prisma.financialDocument.create({
      data: {
        title: body.title.trim(),
        category: body.category,
        documentType: docType,
        customerId,
        supplierId: expenseLinks.supplierId,
        employeeId: expenseLinks.employeeId,
        totalAmount: calculatedTotal,
        paidAmount: 0,
        remainingAmount: calculatedTotal,
        paymentStatus: "unpaid",
        notes: combineIncomeNotes(ie),
        metadata: asJson(meta),
        docDate: ie.docDate ? new Date(ie.docDate) : body.docDate ? new Date(body.docDate) : null,
        pdfStoragePath: null,
        sentToCpa: false,
        items: {
          create: itemsWithProducts.length
            ? itemsWithProducts
            : [
                {
                  itemName: "סיכום",
                  productName: "סיכום",
                  quantity: 1,
                  unitPrice: productTotal,
                  vatType: null,
                  total: productTotal,
                },
              ],
        },
        depositAmount,
        depositType: depositAmount > 0 ? ie.depositType?.trim() || null : null,
        depositNote: depositAmount > 0 ? ie.depositNote?.trim() || null : null,
        depositStatus: depositAmount > 0 ? ie.depositStatus || "open" : "open",
      },
    });

    const sideEffects: Promise<unknown>[] = [saveProductHistoryFromItems(items)];
    if (body.category === "הוצאה" && ie.kind === "expense") {
      sideEffects.push(recordSupplierPriceHistoryFromExpense(ie));
    }
    await Promise.all(sideEffects);

    if (isIncomeRegister) {
      const payments = normalizedPaymentLines(ie);
      if (payments.length > 0 && customerId) {
        await prisma.payment.createMany({
          data: payments.map((payment) => ({
            customerId,
            documentId: doc.id,
            amount: parseNum(payment.amount),
            paymentMethod: payment.instrument.trim() || null,
            notes: payment.notes.trim() || null,
          })),
        });
      }
    }

    await syncFinancialDocumentPaymentTotals(doc.id);
    await Promise.all([
      replaceCashFlowForDocument(doc.id),
      syncCheckPaymentsForDocument(doc.id),
      body.category === "הוצאה" && ie.kind === "expense"
        ? syncExpenseDocumentLedgerEntry(doc.id)
        : Promise.resolve(),
    ]);
    if (session) void logActivity(session.sub, "document_create");
    return NextResponse.json({ ok: true, id: doc.id });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
