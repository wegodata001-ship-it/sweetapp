import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import { parsePayload } from "@/lib/finance/document-payload";

function depositInfo(doc: { metadata: unknown; depositAmount?: number | null; depositType?: string | null; depositNote?: string | null }) {
  const payload = parsePayload(doc.metadata);
  const fromPayload = payload && payload.kind !== "zreport" ? payload : null;
  return {
    amount: doc.depositAmount ?? (fromPayload ? Number(fromPayload.depositAmount) || 0 : 0),
    type: doc.depositType ?? fromPayload?.depositType ?? null,
    note: doc.depositNote ?? fromPayload?.depositNote ?? null,
  };
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const block = await requireDb();
  if (block) return block;
  const { id } = await ctx.params;

  try {
    const body = (await req.json()) as { action?: "returned" | "refunded" };
    if (body.action !== "returned" && body.action !== "refunded") {
      return NextResponse.json({ ok: false, error: "פעולה לא תקינה" }, { status: 400 });
    }

    const doc = await prisma.financialDocument.findUnique({
      where: { id },
      include: { customer: { select: { id: true, name: true } } },
    });
    if (!doc) return NextResponse.json({ ok: false, error: "מסמך לא נמצא" }, { status: 404 });

    const info = depositInfo(doc as typeof doc & { depositAmount?: number | null; depositType?: string | null; depositNote?: string | null });
    if (info.amount <= 0) {
      return NextResponse.json({ ok: false, error: "למסמך אין פיקדון" }, { status: 400 });
    }

    const status = body.action;
    await prisma.financialDocument.update({
      where: { id },
      data: { depositStatus: status } as never,
    });

    if (status === "refunded") {
      await prisma.cashFlowEntry.deleteMany({
        where: { documentId: id, entryType: "deposit_refund", isDirect: false },
      });
      await prisma.cashFlowEntry.create({
        data: {
          entryType: "deposit_refund",
          amount: info.amount,
          description: `החזר פיקדון ${info.type ?? ""} — ${doc.title}`.trim(),
          paymentMethod: null,
          customerId: doc.customerId,
          customerName: doc.customer?.name ?? null,
          notes: info.note,
          documentId: id,
          relatedDocumentId: id,
          entryDate: new Date(),
          isDirect: false,
        },
      });
    }

    return NextResponse.json({ ok: true, status });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
