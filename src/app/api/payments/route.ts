import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { logActivity } from "@/lib/activity-log";
import { syncFinancialDocumentPaymentTotals } from "@/lib/finance/sync-document-amounts";
import {
  replaceCashFlowForDocument,
  syncCashFlowForPayment,
} from "@/lib/finance/document-side-effects";

export async function GET(req: NextRequest) {
  const block = await requireDb();
  if (block) return block;
  const docId = req.nextUrl.searchParams.get("documentId");
  const customerId = req.nextUrl.searchParams.get("customerId");
  try {
    const rows = await prisma.payment.findMany({
      where: {
        ...(docId ? { documentId: docId } : {}),
        ...(customerId ? { customerId } : {}),
      },
      orderBy: { createdAt: "desc" },
      include: { document: { select: { title: true } }, customer: { select: { name: true } } },
    });
    return NextResponse.json({ ok: true, data: rows });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const block = await requireDb();
  if (block) return block;
  const session = await getSessionFromCookie();
  try {
    const body = (await req.json()) as {
      customerId: string;
      documentId?: string | null;
      amount: number;
      paymentMethod?: string | null;
      notes?: string | null;
    };
    if (!body.customerId || !(body.amount > 0)) {
      return NextResponse.json({ ok: false, error: "לקוח וסכום חיוביים נדרשים" }, { status: 400 });
    }

    if (body.documentId) {
      const doc = await prisma.financialDocument.findUnique({
        where: { id: body.documentId },
        select: { totalAmount: true },
      });
      const agg = await prisma.payment.aggregate({
        where: { documentId: body.documentId },
        _sum: { amount: true },
      });
      if (doc && (agg._sum.amount ?? 0) + body.amount > doc.totalAmount + 1e-9) {
        return NextResponse.json(
          { ok: false, error: "סכום התשלומים לא יכול לעלות על סה״כ המסמך" },
          { status: 400 },
        );
      }
    }

    const payment = await prisma.payment.create({
      data: {
        customerId: body.customerId,
        documentId: body.documentId || null,
        amount: body.amount,
        paymentMethod: body.paymentMethod?.trim() || null,
        notes: body.notes?.trim() || null,
      },
    });

    if (body.documentId) {
      await syncFinancialDocumentPaymentTotals(body.documentId);
      await syncCashFlowForPayment(payment.id);
      await replaceCashFlowForDocument(body.documentId);
    } else {
      await syncCashFlowForPayment(payment.id);
    }

    if (session) await logActivity(session.sub, "payment");
    return NextResponse.json({ ok: true, data: payment });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
