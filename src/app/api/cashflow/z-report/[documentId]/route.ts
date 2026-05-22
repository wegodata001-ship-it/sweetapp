import { NextRequest, NextResponse } from "next/server";
import { prismaCashFlowToRow } from "@/lib/finance/cashflow-map";
import {
  buildZReportSummary,
  zBreakdownFromPayload,
  type ZReportDetailPayload,
} from "@/lib/finance/cashflow-z-report";
import { parsePayload } from "@/lib/finance/document-payload";
import { requireDb } from "@/lib/api-route";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ documentId: string }> }) {
  const block = await requireDb();
  if (block) return block;

  const { documentId } = await ctx.params;
  const id = documentId?.trim();
  if (!id) {
    return NextResponse.json({ ok: false, error: "חסר מזהה" }, { status: 400 });
  }

  try {
    const doc = await prisma.financialDocument.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        documentType: true,
        totalAmount: true,
        paymentStatus: true,
        docDate: true,
        createdAt: true,
        notes: true,
        metadata: true,
        items: {
          select: {
            id: true,
            itemName: true,
            quantity: true,
            unitPrice: true,
            total: true,
          },
          orderBy: { itemName: "asc" },
        },
      },
    });

    if (!doc || doc.documentType !== "דוח Z") {
      return NextResponse.json({ ok: false, error: "דוח Z לא נמצא" }, { status: 404 });
    }

    const meta = parsePayload(doc.metadata as unknown);
    if (!meta || meta.kind !== "zreport") {
      return NextResponse.json({ ok: false, error: "נתוני דוח Z לא תקינים" }, { status: 404 });
    }

    const entries = await prisma.cashFlowEntry.findMany({
      where: { zReportId: id },
      orderBy: [{ entryDate: "asc" }, { createdAt: "asc" }],
    });
    const lines = entries.map((e) => prismaCashFlowToRow(e));
    const baseSummary = buildZReportSummary(id, lines);
    const created = doc.createdAt;
    const time = `${String(created.getHours()).padStart(2, "0")}:${String(created.getMinutes()).padStart(2, "0")}`;

    const data: ZReportDetailPayload = {
      summary: {
        ...baseSummary,
        title: doc.title.trim() || baseSummary.title,
        zNumber: meta.zNumber.trim() || baseSummary.zNumber,
        time,
        status: doc.paymentStatus,
        cashierLabel: doc.notes?.trim() || null,
      },
      document: {
        id: doc.id,
        title: doc.title,
        totalAmount: doc.totalAmount,
        paymentStatus: doc.paymentStatus,
        docDate: doc.docDate ? doc.docDate.toISOString().slice(0, 10) : null,
        createdAt: doc.createdAt.toISOString(),
        notes: doc.notes,
      },
      payload: meta,
      lines,
      breakdown: zBreakdownFromPayload(meta),
      items: doc.items.map((it) => ({
        id: it.id,
        itemName: it.itemName,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        total: it.total,
      })),
    };

    return NextResponse.json({ ok: true, data });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
