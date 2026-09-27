import { prisma } from "@/lib/prisma";

/**
 * One in-flight read per process tick.
 * Dashboard summary and the cashflow forecast ask for the same rows at the same time.
 */
function share<T>(slot: { current: Promise<T> | null }, load: () => Promise<T>): Promise<T> {
  if (!slot.current) {
    slot.current = load().finally(() => {
      slot.current = null;
    });
  }
  return slot.current;
}

const incomeSlot: { current: Promise<IncomeForecastDoc[]> | null } = { current: null };
const expenseSlot: { current: Promise<ExpenseForecastDoc[]> | null } = { current: null };
const settingsSlot: { current: Promise<ForecastSettingsRow | null> | null } = { current: null };

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
