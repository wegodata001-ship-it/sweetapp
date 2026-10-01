import { prisma } from "@/lib/prisma";
import { OPEN_CHECK_STATUSES } from "@/lib/checks/types";

/**
 * One in-flight read plus a short TTL.
 * With a single pooler connection, Promise.all runs serially and the
 * previous in-flight-only share expired before forecast/open-invoices ran,
 * so the same income/expense tables were read two or three times.
 */
type ShareSlot<T> = { current: Promise<T> | null; value: T | null; at: number };

function share<T>(slot: ShareSlot<T>, load: () => Promise<T>, ttlMs = 8_000): Promise<T> {
  if (slot.value && Date.now() - slot.at < ttlMs) return Promise.resolve(slot.value);
  if (!slot.current) {
    slot.current = load()
      .then((value) => {
        slot.value = value;
        slot.at = Date.now();
        return value;
      })
      .finally(() => {
        slot.current = null;
      });
  }
  return slot.current;
}

export function clearSharedForecastReads(): void {
  incomeSlot.value = null;
  incomeSlot.at = 0;
  expenseSlot.value = null;
  expenseSlot.at = 0;
  settingsSlot.value = null;
  settingsSlot.at = 0;
  checksSlot.value = null;
  checksSlot.at = 0;
  ordersSlot.value = null;
  ordersSlot.at = 0;
}

const incomeSlot: ShareSlot<IncomeForecastDoc[]> = { current: null, value: null, at: 0 };
const expenseSlot: ShareSlot<ExpenseForecastDoc[]> = { current: null, value: null, at: 0 };
const settingsSlot: ShareSlot<ForecastSettingsRow | null> = { current: null, value: null, at: 0 };
const checksSlot: ShareSlot<OpenCheckForecastRow[]> = { current: null, value: null, at: 0 };
const ordersSlot: ShareSlot<ForecastOrderRow[]> = { current: null, value: null, at: 0 };

export type OpenCheckForecastRow = {
  id: string;
  amount: number;
  dueDate: Date;
  checkNumber: string | null;
  documentId: string | null;
  customer: { name: string } | null;
};

export type ForecastOrderRow = {
  id: string;
  orderNumber: number | string;
  customerName: string;
  remainingAmount: number;
  depositAmount: number;
  depositPaid: boolean;
  eventDate: Date;
  orderCategory: string;
};

export type IncomeForecastDoc = {
  id: string;
  title: string;
  paymentStatus: string;
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  documentType: string;
  docDate: Date | null;
  metadata: unknown;
  customer: { name: string } | null;
};

export type ExpenseForecastDoc = {
  id: string;
  title: string;
  totalAmount: number;
  depositAmount: number;
  paidAmount: number;
  remainingAmount: number;
  paymentStatus: string;
  metadata: unknown;
  docDate: Date | null;
  supplierId: string | null;
  supplier: { name: string } | null;
  employee: { name: string } | null;
};

export type ForecastSettingsRow = {
  forecastBankBalance: number | null;
  forecastManualEntries: unknown;
};

export function loadSharedIncomeDocuments(): Promise<IncomeForecastDoc[]> {
  return share(incomeSlot, () =>
    prisma.financialDocument.findMany({
      where: { category: "הכנסה" },
      select: {
        id: true,
        title: true,
        paymentStatus: true,
        totalAmount: true,
        paidAmount: true,
        remainingAmount: true,
        documentType: true,
        docDate: true,
        metadata: true,
        customer: { select: { name: true } },
      },
    }),
  );
}

export function loadSharedExpenseDocuments(): Promise<ExpenseForecastDoc[]> {
  return share(expenseSlot, async () => {
    try {
      return await prisma.financialDocument.findMany({
        where: { category: "הוצאה" },
        select: {
          id: true,
          title: true,
          totalAmount: true,
          depositAmount: true,
          paidAmount: true,
          remainingAmount: true,
          paymentStatus: true,
          metadata: true,
          docDate: true,
          supplierId: true,
          supplier: { select: { name: true } },
          employee: { select: { name: true } },
        },
      });
    } catch (error) {
      const missing =
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code?: string }).code === "P2022";
      if (!missing) throw error;
      const rows = await prisma.financialDocument.findMany({
        where: { category: "הוצאה" },
        select: {
          id: true,
          title: true,
          totalAmount: true,
          depositAmount: true,
          paidAmount: true,
          remainingAmount: true,
          paymentStatus: true,
          metadata: true,
          docDate: true,
        },
      });
      return rows.map((row) => ({
        ...row,
        supplierId: null,
        supplier: null,
        employee: null,
      }));
    }
  });
}

export function loadSharedForecastSettings(): Promise<ForecastSettingsRow | null> {
  return share(settingsSlot, async () => {
    try {
      const row = await prisma.financeSettings.findUnique({
        where: { id: 1 },
        select: { forecastBankBalance: true, forecastManualEntries: true },
      });
      if (!row) return null;
      return {
        forecastBankBalance: row.forecastBankBalance,
        forecastManualEntries: row.forecastManualEntries,
      };
    } catch {
      return null;
    }
  });
}

export function loadSharedOpenChecks(): Promise<OpenCheckForecastRow[]> {
  return share(checksSlot, () =>
    prisma.checkPayment.findMany({
      where: { status: { in: [...OPEN_CHECK_STATUSES] } },
      select: {
        id: true,
        amount: true,
        dueDate: true,
        checkNumber: true,
        documentId: true,
        customer: { select: { name: true } },
      },
    }),
  );
}

export function hydrateSharedForecastReads(input: {
  income?: IncomeForecastDoc[];
  expense?: ExpenseForecastDoc[];
  settings?: ForecastSettingsRow | null;
  checks?: OpenCheckForecastRow[];
  orders?: ForecastOrderRow[];
}): void {
  const at = Date.now();
  if (input.income) {
    incomeSlot.value = input.income;
    incomeSlot.at = at;
  }
  if (input.expense) {
    expenseSlot.value = input.expense;
    expenseSlot.at = at;
  }
  if (input.settings !== undefined) {
    settingsSlot.value = input.settings;
    settingsSlot.at = at;
  }
  if (input.checks) {
    checksSlot.value = input.checks;
    checksSlot.at = at;
  }
  if (input.orders) {
    ordersSlot.value = input.orders;
    ordersSlot.at = at;
  }
}

export function loadSharedForecastOrders(): Promise<ForecastOrderRow[]> {
  return share(ordersSlot, () =>
    prisma.futureOrder.findMany({
      where: {
        isCompleted: false,
        status: { notIn: ["COMPLETED", "CANCELLED"] },
        remainingAmount: { gt: 0.01 },
      },
      select: {
        id: true,
        orderNumber: true,
        customerName: true,
        remainingAmount: true,
        depositAmount: true,
        depositPaid: true,
        eventDate: true,
        orderCategory: true,
      },
    }),
  );
}
