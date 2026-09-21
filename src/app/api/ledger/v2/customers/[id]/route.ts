import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import { detailFromCustomerStatement, type LedgerV2MovementExtra } from "@/lib/finance/ledger-v2";
import { statementForCustomer } from "@/lib/finance/ledger-route-map";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const block = await requireDb();
  if (block) return block;

  const { id } = await ctx.params;
  const dateFrom = req.nextUrl.searchParams.get("dateFrom")?.trim() || null;
  const dateTo = req.nextUrl.searchParams.get("dateTo")?.trim() || null;

  try {
    const customer = await prisma.customer.findUnique({
      where: { id },
      select: { id: true, name: true, phone: true, openingBalance: true },
    });
    if (!customer) {
      return NextResponse.json({ ok: false, error: "לקוח לא נמצא" }, { status: 404 });
    }

    const [documents, payments] = await Promise.all([
      prisma.financialDocument.findMany({
        where: { customerId: id },
        select: {
          id: true,
          customerId: true,
          documentType: true,
          category: true,
          title: true,
          totalAmount: true,
          remainingAmount: true,
          paymentStatus: true,
          notes: true,
          docDate: true,
          createdAt: true,
        },
      }),
      prisma.payment.findMany({
        where: { customerId: id },
        select: {
          id: true,
          customerId: true,
          amount: true,
          createdAt: true,
          documentId: true,
          paymentMethod: true,
          notes: true,
          document: { select: { title: true } },
        },
      }),
    ]);

    const statement = statementForCustomer({
      id: customer.id,
      name: customer.name,
      openingBalance: customer.openingBalance,
      documents,
      payments: payments.map((p) => ({
        id: p.id,
        customerId: p.customerId,
        amount: p.amount,
        createdAt: p.createdAt,
        documentId: p.documentId,
        documentTitle: p.document?.title ?? null,
      })),
      dateFrom,
      dateTo,
    });

    const extras: Record<string, LedgerV2MovementExtra> = {};
    for (const doc of documents) {
      extras[`doc-${doc.id}`] = {
        paymentStatus: doc.paymentStatus,
        notes: doc.notes,
        documentType: doc.documentType,
      };
    }
    for (const pay of payments) {
      extras[`pay-${pay.id}`] = {
        paymentMethod: pay.paymentMethod,
        notes: pay.notes,
        paymentStatus: pay.document?.title ? "linked" : null,
      };
    }

    return NextResponse.json({
      ok: true,
      detail: detailFromCustomerStatement({
        customer,
        statement,
        extras,
        documents,
      }),
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
