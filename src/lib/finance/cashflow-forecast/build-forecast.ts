import {
  getForecastBankBalance,
  setForecastBankBalance,
} from "@/lib/finance/cashflow-forecast/bank-balance-db";
import {
  collectForecastMovements,
  type ForecastMovement,
} from "@/lib/finance/cashflow-forecast/collect-movements";
import { resolveForecastRange } from "@/lib/finance/cashflow-forecast/date-utils";
import { resolveForecastSourceHref } from "@/lib/finance/cashflow-forecast/source-links";
import type {
  BuildForecastParams,
  CashflowForecastKpis,
  CashflowForecastResult,
  CashflowForecastRow,
  CashflowShortage,
  ForecastAlertLevel,
} from "@/lib/finance/cashflow-forecast/types";

export { getForecastBankBalance, setForecastBankBalance };

function computeAlertLevel(balance: number, openingBalance: number): ForecastAlertLevel {
  if (balance < 0) return "critical";
  if (openingBalance > 0 && balance < openingBalance * 0.2) return "warning";
  return "none";
}

/** תנועות פתוחות באיחור — מוצמדות לתחילת הטווח כדי שלא ייעלמו מהתחזית */
function movementsInForecastRange(
  allMovements: ForecastMovement[],
  dateFrom: string,
  dateTo: string,
): ForecastMovement[] {
  return allMovements
    .filter((m) => m.dueDate <= dateTo)
    .map((m) => {
      if (m.dueDate >= dateFrom) return m;
      return {
        ...m,
        dueDate: dateFrom,
        description: `באיחור — ${m.description}`,
      };
    })
    .sort((a, b) => {
      const cmp = a.dueDate.localeCompare(b.dueDate);
      if (cmp !== 0) return cmp;
      return a.id.localeCompare(b.id);
    });
}

export async function buildCashflowForecast(
  params?: BuildForecastParams,
): Promise<CashflowForecastResult> {
  const { dateFrom, dateTo } = resolveForecastRange(params);
  const bankBalance = await getForecastBankBalance();
  const openingDate = dateFrom;

  const allMovements = await collectForecastMovements(dateFrom);
  const movements = movementsInForecastRange(allMovements, dateFrom, dateTo);

  const rows: CashflowForecastRow[] = [];
  let balance = bankBalance;
  let totalInflows = 0;
  let totalOutflows = 0;

  rows.push({
    id: "opening",
    date: openingDate,
    description: "יתרת פתיחה",
    inflow: null,
    outflow: null,
    expectedBalance: balance,
    isOpening: true,
    isNegative: balance < 0,
    alertLevel: computeAlertLevel(balance, bankBalance),
    sourceType: "opening",
    canDefer: false,
  });

  for (const m of movements) {
    balance = balance + m.inflow - m.outflow;
    totalInflows += m.inflow;
    totalOutflows += m.outflow;
    const alertLevel = computeAlertLevel(balance, bankBalance);
    rows.push({
      id: m.id,
      date: m.dueDate,
      description: m.description,
      inflow: m.inflow > 0 ? m.inflow : null,
      outflow: m.outflow > 0 ? m.outflow : null,
      expectedBalance: balance,
      isOpening: false,
      isNegative: alertLevel === "critical",
      alertLevel,
      sourceType: m.sourceType,
      sourceId: m.sourceId,
      paymentLineId: m.paymentLineId,
      orderCategory: m.orderCategory ?? null,
      sourceHref: resolveForecastSourceHref({
        sourceType: m.sourceType,
        sourceId: m.sourceId,
        orderCategory: m.orderCategory,
      }),
      canDefer: m.canDefer,
    });
  }

  const closingBalance = rows[rows.length - 1]?.expectedBalance ?? bankBalance;
  const kpis: CashflowForecastKpis = {
    openingBalance: bankBalance,
    totalInflows,
    totalOutflows,
    closingBalance,
  };

  const shortages: CashflowShortage[] = [];
  for (const row of rows) {
    if (row.alertLevel === "critical") {
      shortages.push({
        id: row.id,
        date: row.date,
        balance: row.expectedBalance,
        shortageAmount: Math.abs(row.expectedBalance),
      });
    }
  }

  return {
    bankBalance,
    dateFrom,
    dateTo,
    openingDate,
    rows,
    shortages,
    kpis,
  };
}
