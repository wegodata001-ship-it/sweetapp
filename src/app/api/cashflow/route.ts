import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import { prismaCashFlowToRow } from "@/lib/finance/cashflow-map";
import { listCashFlowRows, parseCashflowQueryFilters } from "@/lib/finance/cashflow-filters";

export async function GET(req: NextRequest) {
  const block = await requireDb();
  if (block) return block;
  try {
    const filters = parseCashflowQueryFilters(req.nextUrl.searchParams);
    const data = await listCashFlowRows(filters);
    return NextResponse.json({ ok: true, data });
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
  try {
    const body = (await req.json()) as {
      entryType: string;
      amount: number;
      description?: string | null;
      paymentMethod?: string | null;
      customerId?: string | null;
      customerName?: string | null;
      notes?: string | null;
      entryDate: string;
      paymentId?: string | null;
      documentId?: string | null;
      relatedDocumentId?: string | null;
      isDirect?: boolean;
      expenseType?: string | null;
    };
    if (!body.entryType?.trim() || !body.entryDate) {
      return NextResponse.json({ ok: false, error: "חסרים שדות" }, { status: 400 });
    }
    const rawAmt = Number(body.amount);
    if (!Number.isFinite(rawAmt)) {
      return NextResponse.json({ ok: false, error: "סכום לא תקין" }, { status: 400 });
    }
    const t = body.entryType.trim().toLowerCase();
    const storedAmt =
      t === "income" || t === "expense"
        ? rawAmt >= 0
          ? rawAmt
          : -rawAmt
        : rawAmt >= 0
          ? rawAmt
          : -rawAmt;

    const row = await prisma.cashFlowEntry.create({
      data: {
        entryType: body.entryType.trim(),
        amount: storedAmt,
        description: body.description?.trim() || null,
        paymentMethod: body.paymentMethod?.trim() || null,
        customerId: body.customerId || null,
        customerName: body.customerName?.trim() || null,
        notes: body.notes?.trim() || null,
        entryDate: new Date(body.entryDate),
        paymentId: body.paymentId || null,
        documentId: body.documentId || body.relatedDocumentId || null,
        relatedDocumentId: body.relatedDocumentId || null,
        isDirect: Boolean(body.isDirect),
        expenseType: t === "expense" && body.expenseType?.trim() ? body.expenseType.trim() : null,
      },
    });
    return NextResponse.json({ ok: true, data: prismaCashFlowToRow(row) });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
