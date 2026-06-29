import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const p = prisma as any;

const AUTO_DEPOSIT_SOURCE = "ORDER_DEPOSIT_FIELD";

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function describeDeposit(orderNumber: number, customerName: string | null): string {
  const who = customerName?.trim() ? ` — ${customerName.trim()}` : "";
  return `מקדמת הזמנה #${orderNumber}${who}`;
}

async function main() {
  const orders = await prisma.futureOrder.findMany({
    where: { depositPaid: true, depositAmount: { gt: 0 }, status: { not: "CANCELLED" } },
    select: {
      id: true,
      orderNumber: true,
      customerName: true,
      depositAmount: true,
      depositMethod: true,
    },
    orderBy: { orderNumber: "asc" },
  });

  console.log(`Qualifying orders: ${orders.length}`);
  let created = 0;
  let skipped = 0;

  for (const o of orders) {
    const existing = await p.orderPayment.findFirst({
      where: { orderId: o.id, autoSource: AUTO_DEPOSIT_SOURCE, status: "ACTIVE" },
      select: { id: true },
    });
    if (existing) {
      skipped++;
      console.log(`#${o.orderNumber} skip (already synced)`);
      continue;
    }

    const amount = round2(o.depositAmount);
    const method = o.depositMethod?.trim() || "CASH";
    const paidAt = new Date();

    const payment = await p.orderPayment.create({
      data: {
        orderId: o.id,
        kind: "DEPOSIT",
        amount,
        paymentMethod: method,
        paidAt,
        status: "ACTIVE",
        autoSource: AUTO_DEPOSIT_SOURCE,
        createdById: null,
      },
    });

    await p.cashFlowEntry.create({
      data: {
        entryType: "deposit",
        amount,
        description: describeDeposit(o.orderNumber, o.customerName),
        paymentMethod: method,
        source: "order_deposit",
        relatedOrderId: o.id,
        orderPaymentId: payment.id,
        customerId: null,
        customerName: o.customerName ?? null,
        notes: null,
        entryDate: paidAt,
        isDirect: false,
        documentId: null,
        relatedDocumentId: null,
        zReportId: null,
        paymentId: null,
      },
    });

    created++;
    console.log(`#${o.orderNumber} created deposit +${amount} (${method})`);
  }

  console.log(`\nDONE. created=${created} skipped=${skipped}`);

  const orderCf = await p.cashFlowEntry.findMany({
    where: { source: { startsWith: "order_" } },
    orderBy: { createdAt: "desc" },
  });
  console.log(`\n=== CashFlowEntry order rows now (${orderCf.length}) ===`);
  for (const c of orderCf) {
    console.log(
      `${c.entryType} +${c.amount} src=${c.source} relOrder=${c.relatedOrderId} "${c.description}"`,
    );
  }
}

main()
  .catch((e) => {
    console.error("SYNC ERROR:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
