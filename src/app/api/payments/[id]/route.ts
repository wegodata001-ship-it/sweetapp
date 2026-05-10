import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import { syncFinancialDocumentPaymentTotals } from "@/lib/finance/sync-document-amounts";
import {
  replaceCashFlowForDocument,
  syncCashFlowForPayment,
} from "@/lib/finance/document-side-effects";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const block = await requireDb();
  if (block) return block;
  const { id } = await ctx.params;
  try {
    const prev = await prisma.payment.findUnique({ where: { id } });
    if (!prev) return NextResponse.json({ ok: false, error: "לא נמצא" }, { status: 404 });

    const body = (await req.json()) as {
      amount?: number;
      paymentMethod?: string | null;
      notes?: string | null;
      documentId?: string | null;
    };

    const nextDoc = body.documentId === undefined ? prev.documentId : body.documentId || null;
    if (nextDoc && body.amount !== undefined) {
      const doc = await prisma.financialDocument.findUnique({
        where: { id: nextDoc },
        select: { totalAmount: true },
      });
      const agg = await prisma.payment.aggregate({
        where: { documentId: nextDoc, NOT: { id } },
        _sum: { amount: true },
      });
      if (doc && (agg._sum.amount ?? 0) + body.amount > doc.totalAmount + 1e-9) {
        return NextResponse.json(
          { ok: false, error: "סכום התשלומים לא יכול לעלות על סה״כ המסמך" },
          { status: 400 },
        );
      }
    }

    await prisma.payment.update({
      where: { id },
      data: {
        amount: body.amount,
        paymentMethod: body.paymentMethod === undefined ? undefined : body.paymentMethod?.trim() || null,
        notes: body.notes === undefined ? undefined : body.notes?.trim() || null,
        documentId: body.documentId === undefined ? undefined : body.documentId || null,
      },
    });

    const docsToSync = new Set<string>();
    if (prev.documentId) docsToSync.add(prev.documentId);
    if (nextDoc) docsToSync.add(nextDoc);

    for (const docId of docsToSync) {
      if (docId) {
        await syncFinancialDocumentPaymentTotals(docId);
        await replaceCashFlowForDocument(docId);
      }
    }
    if (!nextDoc) {
      await syncCashFlowForPayment(id);
    }

    const updated = await prisma.payment.findUnique({ where: { id } });
    return NextResponse.json({ ok: true, data: updated });
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
  const { id } = await ctx.params;
  try {
    const prev = await prisma.payment.findUnique({ where: { id } });
    if (!prev) return NextResponse.json({ ok: false, error: "לא נמצא" }, { status: 404 });

    await prisma.payment.delete({ where: { id } });
    await prisma.cashFlowEntry.deleteMany({ where: { isDirect: false, paymentId: id } });

    if (prev.documentId) {
      await syncFinancialDocumentPaymentTotals(prev.documentId);
      await replaceCashFlowForDocument(prev.documentId);
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
