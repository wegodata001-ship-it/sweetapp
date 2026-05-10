import { NextRequest, NextResponse } from "next/server";
import {
  combineIncomeNotes,
  incomeExpenseGrandTotal,
  lineGrossTotal,
  type FinanceDocumentPayload,
  type IncomeExpensePayload,
  type VatMode,
  type ZReportPayload,
} from "@/lib/finance/document-payload";
import { prismaDocToFinanceRow } from "@/lib/finance/map-document";
import { syncFinancialDocumentPaymentTotals } from "@/lib/finance/sync-document-amounts";
import {
  attachProductsToItems,
  normalizedPaymentLines,
  replaceCashFlowForDocument,
  saveProductHistoryFromItems,
} from "@/lib/finance/document-side-effects";
import { prisma } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { logActivity } from "@/lib/activity-log";
import { parseNum } from "@/lib/format-shekel";
import type { Prisma } from "@prisma/client";

function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function GET() {
  const block = await requireDb();
  if (block) return block;
  try {
    const rows = await prisma.financialDocument.findMany({
      include: { customer: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ ok: true, data: rows.map(prismaDocToFinanceRow) });
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

function buildItemsFromIncomeExpense(payload: IncomeExpensePayload) {
  return payload.lines
    .filter((l) => l.itemName.trim() || parseNum(l.price) > 0)
    .map((l) => {
      const qty = Math.max(0, parseNum(l.quantity));
      const price = Math.max(0, parseNum(l.price));
      const vat = l.vatMode as VatMode;
      const lineTotal = lineGrossTotal(l.quantity, l.price, vat);
      return {
        itemName: l.itemName || "שורה",
        quantity: qty || 1,
        unitPrice: price,
        vatType: l.vatMode,
        total: lineTotal,
      };
    });
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
          paymentStatus: total <= 0 ? "UNPAID" : "PAID",
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
    const items = buildItemsFromIncomeExpense(ie);
    const calculatedTotal =
      items.reduce((s, r) => s + r.total, 0) || incomeExpenseGrandTotal(ie);

    const customerId =
      ie.kind === "income" ? await ensureCustomerByName(ie.counterpartyName) : null;

    const isIncomeRegister =
      ie.kind === "income" && body.category === "הכנסה";

    if (isIncomeRegister) {
      const paidRaw = normalizedPaymentLines(ie).reduce((sum, p) => sum + parseNum(p.amount), 0);
      if (paidRaw > calculatedTotal + 1e-9) {
        return NextResponse.json(
          { ok: false, error: "סכום תשלום לא יכול לעלות על סה״כ המסמך" },
          { status: 400 },
        );
      }
    }

    const itemsWithProducts = await attachProductsToItems(items);

    const doc = await prisma.financialDocument.create({
      data: {
        title: body.title.trim(),
        category: body.category,
        documentType: ie.documentType,
        customerId,
        totalAmount: calculatedTotal,
        paidAmount: 0,
        remainingAmount: calculatedTotal,
        paymentStatus: "UNPAID",
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
                  unitPrice: calculatedTotal,
                  vatType: null,
                  total: calculatedTotal,
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
            documentId: doc.id,
            amount: parseNum(payment.amount),
            paymentMethod: payment.instrument.trim() || null,
            notes: payment.notes.trim() || null,
          })),
        });
      }
    }

    await syncFinancialDocumentPaymentTotals(doc.id);
    await replaceCashFlowForDocument(doc.id);
    if (session) await logActivity(session.sub, "document_create");
    return NextResponse.json({ ok: true, id: doc.id });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
