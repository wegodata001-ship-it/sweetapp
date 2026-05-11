import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";

export async function GET() {
  const block = await requireDb();
  if (block) return block;
  try {
    const [incomeDocs, expenseDocs, cashRows, openInvoices, openDepositDocs, openBalancesSum] = await Promise.all([
      prisma.financialDocument.findMany({
        where: { category: "הכנסה" },
        select: { totalAmount: true, depositAmount: true },
      }),
      prisma.financialDocument.findMany({
        where: { category: "הוצאה" },
        select: { totalAmount: true, depositAmount: true },
      }),
      prisma.cashFlowEntry.findMany(),
      prisma.financialDocument.count({
        where: { category: "הכנסה", remainingAmount: { gt: 0 } },
      }),
      prisma.financialDocument.findMany({
        where: { depositStatus: "open" },
        select: { depositAmount: true },
      }),
      prisma.financialDocument.aggregate({
        where: { category: "הכנסה", remainingAmount: { gt: 0 } },
        _sum: { remainingAmount: true },
      }),
    ]);

    let cashNet = 0;
    for (const row of cashRows) {
      const t = row.entryType.toLowerCase();
      const raw = Number(row.amount);
      if (!Number.isFinite(raw)) continue;
      if (t === "income" || t === "invoice" || t === "deposit") {
        cashNet += raw >= 0 ? raw : 0;
      } else if (["expense", "refund", "supplier_payment", "salary", "deposit_refund"].includes(t)) {
        cashNet -= raw >= 0 ? raw : -raw;
      }
    }

    const docNet = (row: { totalAmount: number; depositAmount?: number | null }) =>
      Math.max(0, row.totalAmount - (row.depositAmount ?? 0));
    const income = (incomeDocs as { totalAmount: number; depositAmount?: number | null }[]).reduce(
      (sum, row) => sum + docNet(row),
      0,
    );
    const expenses = (expenseDocs as { totalAmount: number; depositAmount?: number | null }[]).reduce(
      (sum, row) => sum + docNet(row),
      0,
    );
    const openDeposits = (openDepositDocs as { depositAmount?: number | null }[]).reduce(
      (sum, row) => sum + Math.max(0, row.depositAmount ?? 0),
      0,
    );

    return NextResponse.json({
      ok: true,
      data: {
        income,
        expenses,
        cashflow: cashNet,
        openInvoices,
        openDeposits,
        overdueInvoices: 0,
        openBalancesTotal: Math.max(0, openBalancesSum._sum.remainingAmount ?? 0),
      },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
