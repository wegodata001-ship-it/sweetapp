import { prisma } from "@/lib/prisma";
import { RECON_COUNTRY } from "@/lib/controls/reconciliation-constants";
import { parseExternalSpreadsheet } from "@/lib/controls/reconciliation-parse";

export type TurkeyImportSummary = {
  totalRows: number;
  ordersCreated: number;
  ordersUpdated: number;
  customersCreated: number;
  skipped: number;
};

const EVENT_TYPE = "TURKEY";
const STATUS_OPEN = "PENDING"; // "פתוחה" — תואם הסטטוס הקיים במערכת

/**
 * מייבא הזמנות טורקיה אמיתיות אל מבנה ההזמנות הקיים (FutureOrder) + יצירת לקוחות.
 * משתמש אך ורק במודלים הקיימים — אין טבלאות/מודלים חדשים, אין טבלת ביניים.
 * זיהוי כפילות לפי ה-ID הטורקי (turkeyOrderId) — לעולם לא דורס הזמנות WEGO קיימות.
 * אין חישוב עמלות/תשלומים/יתרות/כרטסת.
 */
export async function importTurkeyOrders(buffer: Buffer): Promise<TurkeyImportSummary> {
  const rows = parseExternalSpreadsheet(buffer);
  const summary: TurkeyImportSummary = {
    totalRows: rows.length,
    ordersCreated: 0,
    ordersUpdated: 0,
    customersCreated: 0,
    skipped: 0,
  };
  if (rows.length === 0) return summary;

  // טעינה מוקדמת — נמנע התנגשות orderNumber ונזהה הזמנות טורקיה קיימות
  const existingOrders = await prisma.futureOrder.findMany({
    select: { id: true, orderNumber: true, turkeyOrderId: true },
  });
  const usedNumbers = new Set<number>(existingOrders.map((o) => o.orderNumber));
  let maxNumber = existingOrders.reduce((m, o) => Math.max(m, o.orderNumber), 0);
  const turkeyMap = new Map<string, string>(); // turkeyOrderId → futureOrder.id
  for (const o of existingOrders) {
    if (o.turkeyOrderId) turkeyMap.set(o.turkeyOrderId.trim(), o.id);
  }

  const existingCustomers = await prisma.customer.findMany({ select: { id: true, name: true } });
  const customerByName = new Map<string, string>();
  for (const c of existingCustomers) customerByName.set(c.name.trim().toLowerCase(), c.id);

  const nextFreeNumber = (turkeyId: string | null): number => {
    const numeric = turkeyId ? Number(turkeyId.replace(/[^0-9]/g, "")) : NaN;
    if (Number.isInteger(numeric) && numeric > 0 && !usedNumbers.has(numeric)) {
      usedNumbers.add(numeric);
      return numeric;
    }
    do {
      maxNumber += 1;
    } while (usedNumbers.has(maxNumber));
    usedNumbers.add(maxNumber);
    return maxNumber;
  };

  for (const r of rows) {
    const turkeyId = r.externalOrderId?.trim() || null;
    const code = r.externalCustomerCode?.trim() || null;
    const name = r.externalCustomerName?.trim() || null;

    if (!turkeyId && !code && !name) {
      summary.skipped += 1;
      continue;
    }

    // לקוח — דדופ לפי שם (למודל Customer הקיים אין שדה קוד)
    if (name) {
      const key = name.toLowerCase();
      if (!customerByName.has(key)) {
        const created = await prisma.customer.create({
          data: { name, customerType: "TURKEY" },
          select: { id: true },
        });
        customerByName.set(key, created.id);
        summary.customersCreated += 1;
      }
    }

    const amount = r.externalAmount ?? 0;
    const week = r.externalWeek?.trim() || null;
    const eventDate = r.externalDate ?? new Date();
    const notes = r.paymentMethod ? `אמצעי תשלום: ${r.paymentMethod}` : null;

    const orderData = {
      customerName: name ?? "—",
      customerCode: code,
      weekCode: week,
      country: RECON_COUNTRY.TURKEY,
      eventType: EVENT_TYPE,
      eventDate,
      totalAmount: amount,
      depositAmount: 0,
      remainingAmount: amount,
      depositPaid: false,
      status: STATUS_OPEN,
      isCompleted: false,
      orderCategory: "DAILY_ORDER",
      notes,
      turkeyOrderId: turkeyId,
      turkeyCustomerCode: code,
      turkeyCustomerName: name,
      turkeyAmount: amount,
      turkeyImportDate: new Date(),
      turkeySyncWeek: week,
    };

    const existingId = turkeyId ? turkeyMap.get(turkeyId) : undefined;
    if (existingId) {
      await prisma.futureOrder.update({ where: { id: existingId }, data: orderData });
      summary.ordersUpdated += 1;
    } else {
      const orderNumber = nextFreeNumber(turkeyId);
      const created = await prisma.futureOrder.create({
        data: { ...orderData, orderNumber },
        select: { id: true },
      });
      if (turkeyId) turkeyMap.set(turkeyId, created.id);
      summary.ordersCreated += 1;
    }
  }

  return summary;
}
