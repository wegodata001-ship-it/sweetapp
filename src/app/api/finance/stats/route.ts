import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import { countOpenInvoices } from "@/lib/finance/open-invoices";

export const dynamic = "force-dynamic";

export async function GET() {
  const block = await requireDb();
  if (block) return block;
  try {
    const [incomeDocs, expenseDocs, payments, cashRows, openDepositDocs] = await Promise.all([
      prisma.financialDocument.findMany({
        where: { category: "הכנסה" },
        select: { id: true, totalAmount: true, depositAmount: true },
      }),
      prisma.financialDocument.findMany({
        where: { category: "הוצאה" },
        select: { totalAmount: true, depositAmount: true },
      }),
      prisma.payment.findMany({
        where: {
          document: { is: { category: "הכנסה" } },
        },
        select: { documentId: true, amount: true },
      }),
      prisma.cashFlowEntry.findMany(),
      prisma.financialDocument.findMany({
        where: { depositStatus: "open" },
        select: { depositAmount: true },
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
    const incomeDocRows = incomeDocs as { id: string; totalAmount: number; depositAmount?: number | null }[];
    const paymentsByDocument = new Map<string, number>();
    const totalPayments = payments.reduce((sum, payment) => {
      const amount = Math.max(0, payment.amount);
      if (payment.documentId) {
        paymentsByDocument.set(payment.documentId, (paymentsByDocument.get(payment.documentId) ?? 0) + amount);
      }
      return sum + amount;
    }, 0);
    const totalOrders = incomeDocRows.reduce((sum, row) => sum + Math.max(0, row.totalAmount), 0);
    const openInvoices = await countOpenInvoices({ log: true });
    const openBalancesTotal = Math.max(0, totalOrders - totalPayments);

    return NextResponse.json({
      ok: true,
      data: {
        income,
        expenses,
        cashflow: cashNet,
        openInvoices,
        openDeposits,
        overdueInvoices: 0,
        openBalancesTotal,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
