import { prisma } from "@/lib/prisma";
import { RECON_AMOUNT_EPSILON, RECON_STATUS } from "@/lib/controls/reconciliation-constants";

function normCode(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

/**
 * מבצע התאמה לכל שורות הייבוא מול הזמנות WEGO (FutureOrder) — לפי אותה מדינה.
 * עדיפות התאמה: מזהה חיצוני (turkeyOrderId / orderNumber) → קוד לקוח.
 * שלב ראשון: אין שום עדכון להזמנות — רק קביעת סטטוס/פער בטבלת הביניים.
 */
export async function runReconciliation(importId: string): Promise<void> {
  const imp = await prisma.systemReconciliationImport.findUnique({ where: { id: importId } });
  if (!imp) throw new Error("ייבוא לא נמצא");

  // נקה שורות סינתטיות מהרצה קודמת (חסר בחיצוני)
  await prisma.systemReconciliationRow.deleteMany({
    where: { importId, status: RECON_STATUS.MISSING_IN_EXTERNAL },
  });

  const externalRows = await prisma.systemReconciliationRow.findMany({
    where: { importId },
    orderBy: { createdAt: "asc" },
  });

  // מועמדות WEGO לאותה מדינה
  const candidates = await prisma.futureOrder.findMany({
    where: { country: imp.country },
    select: {
      id: true,
      orderNumber: true,
      customerName: true,
      customerCode: true,
      weekCode: true,
      totalAmount: true,
      turkeyOrderId: true,
    },
  });

  const byTurkeyId = new Map<string, (typeof candidates)[number]>();
  const byNumber = new Map<string, (typeof candidates)[number]>();
  const byCode = new Map<string, (typeof candidates)[number]>();
  for (const o of candidates) {
    if (o.turkeyOrderId && !byTurkeyId.has(o.turkeyOrderId.trim())) {
      byTurkeyId.set(o.turkeyOrderId.trim(), o);
    }
    const numKey = String(o.orderNumber);
    if (!byNumber.has(numKey)) byNumber.set(numKey, o);
    const codeKey = normCode(o.customerCode);
    if (codeKey && !byCode.has(codeKey)) byCode.set(codeKey, o);
  }

  const matchedOrderIds = new Set<string>();

  for (const row of externalRows) {
    const idKey = (row.externalOrderId ?? "").trim();
    let order = idKey ? byTurkeyId.get(idKey) ?? byNumber.get(idKey) : undefined;
    if (!order) {
      const codeKey = normCode(row.externalCustomerCode);
      order = codeKey ? byCode.get(codeKey) : undefined;
    }

    if (!order) {
      await prisma.systemReconciliationRow.update({
        where: { id: row.id },
        data: { matchedOrderId: null, status: RECON_STATUS.MISSING_IN_WEGO, differenceAmount: null },
      });
      continue;
    }

    matchedOrderIds.add(order.id);
    const ext = row.externalAmount ?? 0;
    const wego = order.totalAmount ?? 0;
    const diff = Math.round((ext - wego) * 100) / 100;
    const status =
      Math.abs(diff) <= RECON_AMOUNT_EPSILON ? RECON_STATUS.MATCHED : RECON_STATUS.AMOUNT_DIFFERENCE;

    await prisma.systemReconciliationRow.update({
      where: { id: row.id },
      data: { matchedOrderId: order.id, status, differenceAmount: diff },
    });
  }

  // הזמנות WEGO באותה מדינה ובאותם שבועות שבקובץ — שלא נמצאו בקובץ → חסר בחיצוני
  const importedWeeks = new Set(
    externalRows.map((r) => (r.weekCode ?? "").trim()).filter((w) => w.length > 0),
  );
  const missingExternal = candidates.filter(
    (o) =>
      !matchedOrderIds.has(o.id) &&
      (importedWeeks.size === 0 || (o.weekCode ? importedWeeks.has(o.weekCode.trim()) : false)),
  );
  if (missingExternal.length > 0) {
    await prisma.systemReconciliationRow.createMany({
      data: missingExternal.map((o) => ({
        importId,
        country: imp.country,
        weekCode: o.weekCode ?? imp.weekCode,
        externalOrderId: o.turkeyOrderId,
        externalCustomerCode: o.customerCode,
        externalCustomerName: o.customerName,
        externalAmount: null,
        externalDate: null,
        matchedOrderId: o.id,
        status: RECON_STATUS.MISSING_IN_EXTERNAL,
        differenceAmount: null,
      })),
    });
  }
}
