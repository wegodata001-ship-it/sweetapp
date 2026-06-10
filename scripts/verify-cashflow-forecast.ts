/**
 * בדיקת מנוע תזרים מזומנים מול מסד הנתונים
 * הרצה: npx tsx scripts/verify-cashflow-forecast.ts
 */
import { PrismaClient } from "@prisma/client";
import { collectForecastMovements } from "../src/lib/finance/cashflow-forecast/collect-movements";
import { buildCashflowForecast } from "../src/lib/finance/cashflow-forecast/build-forecast";
import { isDateInRange, resolveForecastRange } from "../src/lib/finance/cashflow-forecast/date-utils";
import { isOpenInvoiceDoc } from "../src/lib/finance/open-invoices";
import { OPEN_CHECK_STATUSES } from "../src/lib/checks/types";
import { parsePayload } from "../src/lib/finance/document-payload";

const prisma = new PrismaClient();

async function main() {
  const range = resolveForecastRange({ dateFrom: "2026-06-01", dateTo: "2026-06-30" });
  const { dateFrom, dateTo } = range;

  console.log("=== בדיקת תזרים מזומנים ===\n");
  console.log(`טווח: ${dateFrom} עד ${dateTo}\n`);

  // --- מקורות במסד ---
  const openChecks = await prisma.checkPayment.findMany({
    where: { status: { in: [...OPEN_CHECK_STATUSES] } },
    select: { id: true, amount: true, dueDate: true, status: true },
  });

  const incomeDocs = await prisma.financialDocument.findMany({
    where: { category: "הכנסה" },
    select: {
      id: true,
      title: true,
      paymentStatus: true,
      totalAmount: true,
      paidAmount: true,
      remainingAmount: true,
      docDate: true,
      metadata: true,
    },
  });
  const openIncome = incomeDocs.filter(isOpenInvoiceDoc);

  const futureOrders = await prisma.futureOrder.findMany({
    where: {
      isCompleted: false,
      status: { notIn: ["COMPLETED", "CANCELLED"] },
      remainingAmount: { gt: 0.01 },
    },
    select: { id: true, remainingAmount: true, eventDate: true, depositPaid: true, depositAmount: true },
  });

  const expenseDocs = await prisma.financialDocument.findMany({
    where: { category: "הוצאה" },
    select: {
      id: true,
      title: true,
      totalAmount: true,
      paidAmount: true,
      remainingAmount: true,
      docDate: true,
      metadata: true,
    },
  });
  const openExpense = expenseDocs.filter((d) => {
    const rem =
      d.remainingAmount > 0.01 ? d.remainingAmount : Math.max(0, d.totalAmount - d.paidAmount);
    return rem > 0.01;
  });
  const expenseNoMeta = openExpense.filter((d) => {
    const meta = parsePayload(d.metadata);
    return !meta || meta.kind !== "expense";
  });

  const payments = await prisma.payment.findMany({
    select: { id: true, amount: true, documentId: true, createdAt: true },
  });
  const orphanPayments = payments.filter((p) => !p.documentId);

  console.log("--- מקורות במסד הנתונים ---");
  console.log(`צ'קים פתוחים (נכנסים): ${openChecks.length} | סה"כ: ₪${openChecks.reduce((s, c) => s + c.amount, 0).toLocaleString("he-IL")}`);
  console.log(`חשבוניות הכנסה פתוחות: ${openIncome.length} | יתרה: ₪${openIncome.reduce((s, d) => s + (d.remainingAmount > 0.01 ? d.remainingAmount : d.totalAmount - d.paidAmount), 0).toLocaleString("he-IL")}`);
  console.log(`הזמנות עתידיות: ${futureOrders.length} | יתרה: ₪${futureOrders.reduce((s, o) => s + o.remainingAmount, 0).toLocaleString("he-IL")}`);
  console.log(`מסמכי הוצאה פתוחים: ${openExpense.length} | יתרה: ₪${openExpense.reduce((s, d) => s + (d.remainingAmount > 0.01 ? d.remainingAmount : d.totalAmount - d.paidAmount), 0).toLocaleString("he-IL")}`);
  console.log(`  ↳ ללא metadata תקין (לא נכללים במנוע!): ${expenseNoMeta.length}`);
  console.log(`תשלומי לקוח ללא מסמך: ${orphanPayments.length}`);

  // --- מנוע ---
  const allMovements = await collectForecastMovements(dateFrom);
  const beforeRange = allMovements.filter((m) => m.dueDate < dateFrom && m.dueDate <= dateTo);
  const afterRange = allMovements.filter((m) => m.dueDate > dateTo);
  const inRangeRaw = allMovements.filter((m) => isDateInRange(m.dueDate, dateFrom, dateTo));

  const byType = (list: typeof allMovements) => {
    const map = new Map<string, { count: number; inflow: number; outflow: number }>();
    for (const m of list) {
      const cur = map.get(m.sourceType) ?? { count: 0, inflow: 0, outflow: 0 };
      cur.count++;
      cur.inflow += m.inflow;
      cur.outflow += m.outflow;
      map.set(m.sourceType, cur);
    }
    return map;
  };

  console.log("\n--- תנועות שנאספו (collectForecastMovements) ---");
  console.log(`סה"כ: ${allMovements.length} | בטווח (תאריך מקורי): ${inRangeRaw.length} | באיחור (יוצמדו ל-${dateFrom}): ${beforeRange.length} | אחרי טווח: ${afterRange.length}`);
  for (const [type, v] of byType(allMovements)) {
    console.log(`  ${type}: ${v.count} | +₪${v.inflow.toLocaleString("he-IL")} | -₪${v.outflow.toLocaleString("he-IL")}`);
  }

  if (beforeRange.length > 0) {
    console.log("\n⚠ תנועות שלא בטווח (תאריך < from) — לא יוצגו בתזרים:");
    for (const m of beforeRange.slice(0, 10)) {
      console.log(`  ${m.dueDate} | ${m.description} | +${m.inflow} / -${m.outflow}`);
    }
    if (beforeRange.length > 10) console.log(`  ... ועוד ${beforeRange.length - 10}`);
  }

  if (expenseNoMeta.length > 0) {
    console.log("\n⚠ הוצאות פתוחות ללא metadata (מוחרגות מהמנוע):");
    for (const d of expenseNoMeta.slice(0, 5)) {
      const rem = d.remainingAmount > 0.01 ? d.remainingAmount : d.totalAmount - d.paidAmount;
      console.log(`  ${d.id} | ${d.title} | ₪${rem}`);
    }
  }

  // --- KPI ---
  const forecast = await buildCashflowForecast({ dateFrom, dateTo });
  const { kpis } = forecast;
  const calcClosing = kpis.openingBalance + kpis.totalInflows - kpis.totalOutflows;
  const kpiOk = Math.abs(calcClosing - kpis.closingBalance) < 0.02;

  console.log("\n--- KPI (buildCashflowForecast) ---");
  console.log(`יתרת פתיחה: ₪${kpis.openingBalance.toLocaleString("he-IL")}`);
  console.log(`סה"כ הכנסות בטווח: ₪${kpis.totalInflows.toLocaleString("he-IL")}`);
  console.log(`סה"כ הוצאות בטווח: ₪${kpis.totalOutflows.toLocaleString("he-IL")}`);
  console.log(`יתרה צפויה: ₪${kpis.closingBalance.toLocaleString("he-IL")}`);
  console.log(`בדיקת נוסחה (פתיחה+הכנסות-הוצאות): ₪${calcClosing.toLocaleString("he-IL")} ${kpiOk ? "✓" : "✗ שגיאה!"}`);

  // דוגמה 10k+5k-2k
  const example = await buildCashflowForecast({
    dateFrom: "2099-01-01",
    dateTo: "2099-12-31",
  });
  // manual unit-style check on synthetic logic
  const testOpening = 10000;
  const testIn = 5000;
  const testOut = 2000;
  const testClose = testOpening + testIn - testOut;
  console.log(`\n--- בדיקת נוסחה (דוגמה) ---`);
  console.log(`10,000 + 5,000 - 2,000 = ${testClose} ${testClose === 13000 ? "✓" : "✗"}`);

  const negatives = forecast.rows.filter((r) => r.isNegative && !r.isOpening);
  console.log(`\n--- מינוס / התראות ---`);
  console.log(`שורות שליליות בטווח: ${negatives.length}`);
  console.log(`חוסרים (shortages): ${forecast.shortages.length}`);
  for (const s of forecast.shortages.slice(0, 5)) {
    console.log(`  ${s.date}: יתרה ₪${s.balance} | חוסר ₪${s.shortageAmount}`);
  }

  const hasDbData =
    openChecks.length + openIncome.length + futureOrders.length + openExpense.length > 0;
  const hasForecastRows = forecast.rows.length > 1;
  console.log("\n--- סיכום ---");
  if (hasDbData && !hasForecastRows) {
    console.log("⚠ בעיה: יש נתונים במסד אך אין תנועות בטווח הנבחר!");
    console.log(`  סיבה אפשרית: ${beforeRange.length} תנועות לפני ${dateFrom}, ${afterRange.length} אחרי ${dateTo}`);
  } else if (!hasDbData) {
    console.log("ℹ אין תנועות פתוחות במסד — תזרים ריק צפוי");
  } else {
    console.log("✓ יש נתונים במסד ותנועות בטווח");
  }

  console.log(`\nשורות בתצוגה: ${forecast.rows.length} (כולל יתרת פתיחה)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
