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
import { documentTypeForEmployeePay, normalizeEmployeePayType } from "@/lib/finance/employee-pay-types";
import {
  resolveExpenseDocumentLinks,
  syncExpenseDocumentLedgerEntry,
} from "@/lib/finance/expense-ledger-sync";
import { normalizeExpenseType } from "@/lib/finance/expense-types";
import { recordSupplierPriceHistoryFromExpense } from "@/lib/procurement/record-expense-prices";
import { syncFinancialDocumentPaymentTotals } from "@/lib/finance/sync-document-amounts";
import {
  attachProductsToItems,
  normalizedPaymentLines,
  replaceCashFlowForDocument,
  saveProductHistoryFromItems,
  syncCheckPaymentsForDocument,
} from "@/lib/finance/document-side-effects";
import { prisma, prismaAny } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { logActivity } from "@/lib/activity-log";
import { parseNum } from "@/lib/format-shekel";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { bucketForStoragePath } from "@/lib/pdf/constants";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
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

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const block = await requireDb();
  if (block) return block;
  const { id } = await ctx.params;
  try {
    const row = await prismaAny.financialDocument.findUnique({
      where: { id },
      include: {
        customer: { select: { name: true } },
        payments: { select: { amount: true } },
        sentToCpaBy: { select: { id: true, fullName: true } },
      },
    });
    if (!row) return NextResponse.json({ ok: false, error: "לא נמצא" }, { status: 404 });
    return NextResponse.json({ ok: true, data: prismaDocToFinanceRow(row) });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const block = await requireDb();
  if (block) return block;
  const session = await getSessionFromCookie();
  const { id } = await ctx.params;
  try {
    const body = (await req.json()) as {
      title?: string;
      category?: string;
      doc_date?: string | null;
      sent_to_cpa?: boolean;
      payload?: FinanceDocumentPayload;
    };

    const existing = await prisma.financialDocument.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ ok: false, error: "לא נמצא" }, { status: 404 });

    if (body.payload) {
      const meta = body.payload;
      if (meta.kind === "zreport") {
        const z = meta;
        const total = zTotal(z);
        await prisma.financialDocumentItem.deleteMany({ where: { documentId: id } });
        await prisma.financialDocument.update({
          where: { id },
          data: {
            title: body.title ?? existing.title,
            category: body.category ?? existing.category,
            documentType: "דוח Z",
            totalAmount: total,
            paidAmount: total,
            remainingAmount: 0,
            paymentStatus: total <= 0 ? "unpaid" : "paid",
            metadata: asJson(meta),
            docDate: z.zDate ? new Date(z.zDate) : undefined,
            sentToCpa: body.sent_to_cpa ?? undefined,
          },
        });
        await syncFinancialDocumentPaymentTotals(id);
        await replaceCashFlowForDocument(id);
      } else {
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

        const hasCheckLine =
          ie.kind === "income" &&
          (ie.payments ?? []).some((p) => p.instrument === "CHECK");
        if (ie.kind === "income" && !customerId && hasCheckLine) {
          customerId = await ensureCustomerByName("ללא לקוח");
        }

        const category = body.category ?? existing.category;
        const isIncomeRegister = ie.kind === "income" && category === "הכנסה";
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

        await prisma.payment.deleteMany({ where: { documentId: id } });

        await prisma.financialDocumentItem.deleteMany({ where: { documentId: id } });
        const itemsWithProducts = await attachProductsToItems(items);
        const expenseLinks =
          ie.kind === "expense" ? resolveExpenseDocumentLinks(ie) : { supplierId: null, employeeId: null };
        const docType =
          ie.kind === "expense" && normalizeExpenseType(ie.expenseType) === "WORKER_PAYMENTS"
            ? documentTypeForEmployeePay(normalizeEmployeePayType(ie.employeePayType))
            : ie.documentType;
        await prisma.financialDocument.update({
          where: { id },
          data: {
            title: body.title ?? existing.title,
            category,
            documentType: docType,
            customerId,
            supplierId: expenseLinks.supplierId,
            employeeId: expenseLinks.employeeId,
            totalAmount: calculatedTotal,
            depositAmount,
            depositType: depositAmount > 0 ? ie.depositType?.trim() || null : null,
            depositNote: depositAmount > 0 ? ie.depositNote?.trim() || null : null,
            depositStatus: depositAmount > 0 ? ie.depositStatus || "open" : "open",
            metadata: asJson(meta),
            notes: combineIncomeNotes(ie),
            docDate: ie.docDate ? new Date(ie.docDate) : body.doc_date ? new Date(body.doc_date) : undefined,
            sentToCpa: body.sent_to_cpa ?? undefined,
            items: {
              create:
                itemsWithProducts.length > 0
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
          },
        });
        await saveProductHistoryFromItems(items);

        if (isIncomeRegister) {
          const payments = normalizedPaymentLines(ie);
          if (payments.length > 0 && customerId) {
            await prisma.payment.createMany({
              data: payments.map((payment) => ({
                customerId,
                documentId: id,
                amount: parseNum(payment.amount),
                paymentMethod: payment.instrument.trim() || null,
                notes: payment.notes.trim() || null,
              })),
            });
          }
        }

        await syncFinancialDocumentPaymentTotals(id);
        await replaceCashFlowForDocument(id);
        await syncCheckPaymentsForDocument(id);
        if (category === "הוצאה" && ie.kind === "expense") {
          await recordSupplierPriceHistoryFromExpense(ie);
          await syncExpenseDocumentLedgerEntry(id);
        } else {
          await prisma.ledgerEntry.deleteMany({ where: { financialDocumentId: id } });
        }
      }
    } else {
      await prisma.financialDocument.update({
        where: { id },
        data: {
          title: body.title,
          category: body.category,
          docDate:
            body.doc_date === undefined ? undefined : body.doc_date ? new Date(body.doc_date) : null,
          sentToCpa: body.sent_to_cpa,
        },
      });
      await replaceCashFlowForDocument(id);
    }

    const updated = await prismaAny.financialDocument.findUnique({
      where: { id },
      include: {
        customer: { select: { name: true } },
        payments: { select: { amount: true } },
        sentToCpaBy: { select: { id: true, fullName: true } },
      },
    });
    if (session) await logActivity(session.sub, "document_edit");
    return NextResponse.json({ ok: true, data: updated ? prismaDocToFinanceRow(updated) : null });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const block = await requireDb();
  if (block) return block;
  const session = await getSessionFromCookie();
  const { id } = await ctx.params;
  try {
    const existing = await prisma.financialDocument.findUnique({
      where: { id },
      select: { pdfStoragePath: true },
    });
    if (!existing) return NextResponse.json({ ok: false, error: "לא נמצא" }, { status: 404 });

    if (existing.pdfStoragePath) {
      const supabase = getSupabaseServiceClient();
      if (supabase) {
        const path = existing.pdfStoragePath;
        await supabase.storage.from(bucketForStoragePath(path)).remove([path]);
      }
    }

    await prisma.cashFlowEntry.deleteMany({
      where: {
        isDirect: false,
        OR: [{ documentId: id }, { relatedDocumentId: id }, { zReportId: id }],
      },
    });

    await prisma.payment.deleteMany({ where: { documentId: id } });
    await prisma.financialDocument.delete({ where: { id } });
    if (session) await logActivity(session.sub, "document_delete");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
