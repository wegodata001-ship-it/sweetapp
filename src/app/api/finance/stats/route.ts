import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";

export async function GET() {
  const block = await requireDb();
  if (block) return block;
  try {
    const [incomeAgg, expenseAgg, cashRows, openInvoices] = await Promise.all([
      prisma.financialDocument.aggregate({
        where: { category: "הכנסה" },
        _sum: { totalAmount: true },
      }),
      prisma.financialDocument.aggregate({
        where: { category: "הוצאה" },
        _sum: { totalAmount: true },
      }),
      prisma.cashFlowEntry.findMany(),
      prisma.financialDocument.count({
        where: { category: "הכנסה", remainingAmount: { gt: 0 } },
      }),
    ]);

    let cashNet = 0;
    for (const row of cashRows) {
      const t = row.entryType.toLowerCase();
      const raw = Number(row.amount);
      if (!Number.isFinite(raw)) continue;
      if (t === "income" || t === "invoice") {
        cashNet += raw >= 0 ? raw : 0;
      } else if (["expense", "refund", "supplier_payment", "salary"].includes(t)) {
        cashNet -= raw >= 0 ? raw : -raw;
      }
    }

    const income = incomeAgg._sum.totalAmount ?? 0;
    const expenses = expenseAgg._sum.totalAmount ?? 0;

    return NextResponse.json({
      ok: true,
      data: {
        income,
        expenses,
        cashflow: cashNet,
        openInvoices,
        overdueInvoices: 0,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
