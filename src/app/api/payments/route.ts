import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { logActivity } from "@/lib/activity-log";
import {
  PaymentDocumentNotFoundError,
  PaymentOverLimitError,
  saveDocumentLinkedPayment,
  saveStandalonePayment,
} from "@/lib/finance/save-document-payment";

type CheckDetails = {
  checkNumber?: string;
  bankName?: string;
  branch?: string | null;
  dueDate?: string;
  notes?: string | null;
};

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
      check?: CheckDetails;
    };
    if (!body.customerId || !(body.amount > 0)) {
      return NextResponse.json({ ok: false, error: "לקוח וסכום חיוביים נדרשים" }, { status: 400 });
    }

    if (body.paymentMethod === "CHECK") {
      const c = body.check ?? {};
      const due = c.dueDate ? new Date(c.dueDate) : null;
      if (!c.checkNumber?.trim() || !c.bankName?.trim() || !due || !Number.isFinite(due.getTime())) {
        return NextResponse.json(
          { ok: false, error: "בעת תשלום בצ'ק חובה למלא מספר צ'ק, בנק ותאריך פירעון" },
          { status: 400 },
        );
      }
    }

    const check =
      body.paymentMethod === "CHECK" && body.check
        ? {
            checkNumber: body.check.checkNumber!.trim(),
            bankName: body.check.bankName!.trim(),
            branch: body.check.branch?.trim() || null,
            dueDate: new Date(body.check.dueDate!),
            notes: body.check.notes?.trim() || null,
            createdById: session?.sub ?? null,
          }
        : null;

    const payment = body.documentId
      ? await saveDocumentLinkedPayment({
          customerId: body.customerId,
          documentId: body.documentId,
          amount: body.amount,
          paymentMethod: body.paymentMethod,
          notes: body.notes,
          check,
        })
      : await saveStandalonePayment({
          customerId: body.customerId,
          amount: body.amount,
          paymentMethod: body.paymentMethod,
          notes: body.notes,
        });

    if (session) void logActivity(session.sub, "payment");
    const { invalidateDashboardCaches } = await import("@/lib/dashboard/invalidate");
    invalidateDashboardCaches();
    return NextResponse.json({ ok: true, data: payment });
  } catch (e) {
    if (e instanceof PaymentOverLimitError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
    }
    if (e instanceof PaymentDocumentNotFoundError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: 404 });
    }
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
