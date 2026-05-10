import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import { prismaCashFlowToRow } from "@/lib/finance/cashflow-map";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const block = await requireDb();
  if (block) return block;
  const { id } = await ctx.params;
  try {
    const body = (await req.json()) as {
      entry_date?: string;
      entryType?: string;
      description?: string | null;
      customerName?: string | null;
      paymentMethod?: string | null;
      inflow?: number;
      outflow?: number;
    };

    const existing = await prisma.cashFlowEntry.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ ok: false, error: "לא נמצא" }, { status: 404 });

    let inflow = body.inflow;
    let outflow = body.outflow;
    if (inflow !== undefined && outflow !== undefined) {
      if (inflow > 0 && outflow > 0) {
        return NextResponse.json({ ok: false, error: "נא להזין כניסה או יציאה, לא את שניהם." }, { status: 400 });
      }
    }
    if (inflow !== undefined && inflow > 0) outflow = 0;
    if (outflow !== undefined && outflow > 0) inflow = 0;

    let entryType = body.entryType?.trim().toLowerCase() || existing.entryType;
    let amount = existing.amount;

    if (inflow !== undefined || outflow !== undefined) {
      if ((inflow ?? 0) > 0) {
        entryType = "income";
        amount = inflow ?? 0;
      } else if ((outflow ?? 0) > 0) {
        entryType = "expense";
        amount = outflow ?? 0;
      }
    }

    const updated = await prisma.cashFlowEntry.update({
      where: { id },
      data: {
        entryDate: body.entry_date ? new Date(body.entry_date) : undefined,
        description: body.description === undefined ? undefined : body.description?.trim() || null,
        customerName: body.customerName === undefined ? undefined : body.customerName?.trim() || null,
        paymentMethod: body.paymentMethod === undefined ? undefined : body.paymentMethod?.trim() || null,
        entryType,
        amount,
      },
    });

    return NextResponse.json({ ok: true, data: prismaCashFlowToRow(updated) });
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
    await prisma.cashFlowEntry.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
