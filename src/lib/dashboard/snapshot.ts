import { prisma } from "@/lib/prisma";
import { OPEN_CHECK_STATUSES } from "@/lib/checks/types";
import { normalizeExpenseType, type ExpenseType } from "@/lib/finance/expense-types";
import { isOpenInvoiceDoc } from "@/lib/finance/open-invoices";
import {
  hydrateSharedForecastReads,
  type ExpenseForecastDoc,
  type ForecastOrderRow,
  type ForecastSettingsRow,
  type IncomeForecastDoc,
  type OpenCheckForecastRow,
} from "@/lib/finance/shared-forecast-reads";
import { ORDER_CATEGORY_DAILY, ORDER_CATEGORY_WEDDING } from "@/lib/future-orders/helpers";
import { isSystemCleanMode } from "@/lib/system/clean-mode";
import {
  hmToMinutes,
  israelCalendarDateString,
  minutesSinceMidnightIsrael,
  parseCalendarDateToDbDate,
} from "@/lib/staff/work-date";
import { customRangeBounds } from "@/lib/dashboard/dashboard-period";
import { boundsForDashboardRange } from "@/lib/dashboard/time-range";
import type { CashRow } from "@/lib/dashboard/financial-engine";

const LATE_GRACE_MINUTES = 15;

type LateShiftRow = { userId: string; startTime: string; isActive: boolean };

export type DashboardWindowCounts = {
  zToday: number;
  zWeek: number;
  zMonth: number;
  zCustom: number;
  weddingToday: { weddings: number; orders: number; documented: number };
  weddingWeek: { weddings: number; orders: number; documented: number };
  weddingMonth: { weddings: number; orders: number; documented: number };
  weddingCustom: { weddings: number; orders: number; documented: number };
};

export type DashboardSnapshot = {
  cashRows: CashRow[];
  metaByDocId: Map<string, ExpenseType>;
  window: DashboardWindowCounts;
  newCustomers: number;
  notifyWidgets: {
    lateEmployees: number;
    overdueTasks: number;
    pendingChecks: number;
    upcomingOrders: number;
  };
  shortageCount: number;
  alertOrders: Array<{
    id: string;
    orderNumber: number | string;
    customerName: string;
    orderCategory: string;
    eventDate: Date;
    depositAmount: number;
    depositPaid: boolean;
    remainingAmount: number;
    status: string;
    isCompleted: boolean;
  }>;
  employeeTasksToday: Array<{
    status: string;
    targetDueAt: Date | null;
    completedAt: Date | null;
  }>;
  incomeDocs: IncomeForecastDoc[];
  expenseDocs: ExpenseForecastDoc[];
  dbQueries: 1;
};

type ShareSlot<T> = { current: Promise<T> | null; value: T | null; at: number };
const snapshotSlots = new Map<string, ShareSlot<DashboardSnapshot>>();

function snapshotShareKey(opts?: { fromDate?: string; toDate?: string }): string {
  if (opts?.fromDate && opts.toDate) return `custom:${opts.fromDate}:${opts.toDate}`;
  return "preset";
}

function shareSnapshot(
  key: string,
  load: () => Promise<DashboardSnapshot>,
  ttlMs = 8_000,
): Promise<DashboardSnapshot> {
  let slot = snapshotSlots.get(key);
  if (!slot) {
    slot = { current: null, value: null, at: 0 };
    snapshotSlots.set(key, slot);
  }
  if (slot.value && Date.now() - slot.at < ttlMs) {
    return Promise.resolve(slot.value);
  }
  if (!slot.current) {
    slot.current = load()
      .then((value) => {
        slot!.value = value;
        slot!.at = Date.now();
        return value;
      })
      .finally(() => {
        slot!.current = null;
      });
  }
  return slot.current;
}

export function clearDashboardSnapshot(): void {
  snapshotSlots.clear();
}

function parseJsonArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function asDate(value: unknown): Date {
  if (value instanceof Date) return value;
  return new Date(String(value));
}

function asDateOrNull(value: unknown): Date | null {
  if (value == null || value === "") return null;
  const d = asDate(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function countLateEmployees(shifts: LateShiftRow[], attendanceUserIds: string[], nowMin: number): number {
  const attSet = new Set(attendanceUserIds);
  let lateEmployees = 0;
  for (const s of shifts) {
    if (!s.isActive) continue;
    const start = hmToMinutes(s.startTime);
    if (start === null || nowMin < start + LATE_GRACE_MINUTES) continue;
    if (!attSet.has(s.userId)) lateEmployees += 1;
  }
  return lateEmployees;
}

function monthStart(offset = 0) {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + offset, 1, 0, 0, 0, 0);
}

export async function loadDashboardSnapshot(opts?: {
  fromDate?: string;
  toDate?: string;
}): Promise<DashboardSnapshot> {
  const key = snapshotShareKey(opts);
  return shareSnapshot(key, () => loadDashboardSnapshotUncached(opts));
}

async function loadDashboardSnapshotUncached(opts?: {
  fromDate?: string;
  toDate?: string;
}): Promise<DashboardSnapshot> {
  const chartFrom = new Date();
  chartFrom.setDate(chartFrom.getDate() - 35);
  chartFrom.setHours(0, 0, 0, 0);
  const today0 = new Date();
  today0.setHours(0, 0, 0, 0);
  const todayEnd = new Date(today0);
  todayEnd.setHours(23, 59, 59, 999);
  const nowStart = monthStart(0);
  const weddingHorizon = new Date(today0);
  weddingHorizon.setDate(weddingHorizon.getDate() + 8);
  const dailyHorizon = new Date(today0);
  dailyHorizon.setDate(dailyHorizon.getDate() + 4);
  const weekFrom = boundsForDashboardRange("week").from;
  const monthBounds = boundsForDashboardRange("month");
  const monthFrom = monthBounds.from;
  const monthTo = monthBounds.to;
  const customBounds =
    opts?.fromDate && opts.toDate ? customRangeBounds(opts.fromDate, opts.toDate) : null;
  const customFrom = customBounds?.from ?? monthFrom;
  const customTo = customBounds?.to ?? monthTo;
  const cashFrom =
    customBounds && customBounds.from.getTime() < chartFrom.getTime() ? customBounds.from : chartFrom;
  const workDate = parseCalendarDateToDbDate(israelCalendarDateString());
  const nowMin = minutesSinceMidnightIsrael(new Date());
  const widgetToday = new Date();
  widgetToday.setHours(0, 0, 0, 0);
  const horizon = new Date(widgetToday);
  horizon.setDate(horizon.getDate() + 7);
  const orderMax = new Date();
  orderMax.setDate(orderMax.getDate() + 2);
  const openCheckStatuses = [...OPEN_CHECK_STATUSES];

  const rows = await prisma.$queryRaw<
    Array<{
      z_today: number;
      z_week: number;
      z_month: number;
      z_custom: number;
      weddings_today: number;
      weddings_week: number;
      weddings_month: number;
      weddings_custom: number;
      orders_today: number;
      orders_week: number;
      orders_month: number;
      orders_custom: number;
      documented_today: number;
      documented_week: number;
      documented_month: number;
      documented_custom: number;
      new_customers: number;
      overdue_tasks: number;
      pending_checks: number;
      upcoming_orders: number;
      shortage_count: number;
      late_shifts: unknown;
      late_attendance: unknown;
      cash_rows: unknown;
      cash_meta: unknown;
      income_docs: unknown;
      expense_docs: unknown;
      alert_orders: unknown;
      employee_tasks: unknown;
      open_checks: unknown;
      forecast_orders: unknown;
      forecast_settings: unknown;
    }>
  >`
    SELECT
      (SELECT count(*)::int FROM "FinancialDocument"
        WHERE "documentType" = 'דוח Z'
          AND (("docDate" >= (${today0} AT TIME ZONE 'UTC')::date AND "docDate" <= (${todayEnd} AT TIME ZONE 'UTC')::date)
            OR ("docDate" IS NULL AND "createdAt" >= ${today0} AND "createdAt" <= ${todayEnd}))) AS z_today,
      (SELECT count(*)::int FROM "FinancialDocument"
        WHERE "documentType" = 'דוח Z'
          AND (("docDate" >= (${weekFrom} AT TIME ZONE 'UTC')::date AND "docDate" <= (${todayEnd} AT TIME ZONE 'UTC')::date)
            OR ("docDate" IS NULL AND "createdAt" >= ${weekFrom} AND "createdAt" <= ${todayEnd}))) AS z_week,
      (SELECT count(*)::int FROM "FinancialDocument"
        WHERE "documentType" = 'דוח Z'
          AND (("docDate" >= (${monthFrom} AT TIME ZONE 'UTC')::date AND "docDate" <= (${monthTo} AT TIME ZONE 'UTC')::date)
            OR ("docDate" IS NULL AND "createdAt" >= ${monthFrom} AND "createdAt" <= ${monthTo}))) AS z_month,
      (SELECT count(*)::int FROM "FinancialDocument"
        WHERE "documentType" = 'דוח Z'
          AND (("docDate" >= (${customFrom} AT TIME ZONE 'UTC')::date AND "docDate" <= (${customTo} AT TIME ZONE 'UTC')::date)
            OR ("docDate" IS NULL AND "createdAt" >= ${customFrom} AND "createdAt" <= ${customTo}))) AS z_custom,
      (SELECT count(*)::int FROM "FutureOrder"
        WHERE "orderCategory" = ${ORDER_CATEGORY_WEDDING}
          AND "createdAt" >= ${today0} AND "createdAt" <= ${todayEnd}) AS weddings_today,
      (SELECT count(*)::int FROM "FutureOrder"
        WHERE "orderCategory" = ${ORDER_CATEGORY_WEDDING}
          AND "createdAt" >= ${weekFrom} AND "createdAt" <= ${todayEnd}) AS weddings_week,
      (SELECT count(*)::int FROM "FutureOrder"
        WHERE "orderCategory" = ${ORDER_CATEGORY_WEDDING}
          AND "createdAt" >= ${monthFrom} AND "createdAt" <= ${monthTo}) AS weddings_month,
      (SELECT count(*)::int FROM "FutureOrder"
        WHERE "orderCategory" = ${ORDER_CATEGORY_WEDDING}
          AND "createdAt" >= ${customFrom} AND "createdAt" <= ${customTo}) AS weddings_custom,
      (SELECT count(*)::int FROM "FutureOrder"
        WHERE "orderCategory" = ${ORDER_CATEGORY_DAILY}
          AND "createdAt" >= ${today0} AND "createdAt" <= ${todayEnd}) AS orders_today,
      (SELECT count(*)::int FROM "FutureOrder"
        WHERE "orderCategory" = ${ORDER_CATEGORY_DAILY}
          AND "createdAt" >= ${weekFrom} AND "createdAt" <= ${todayEnd}) AS orders_week,
      (SELECT count(*)::int FROM "FutureOrder"
        WHERE "orderCategory" = ${ORDER_CATEGORY_DAILY}
          AND "createdAt" >= ${monthFrom} AND "createdAt" <= ${monthTo}) AS orders_month,
      (SELECT count(*)::int FROM "FutureOrder"
        WHERE "orderCategory" = ${ORDER_CATEGORY_DAILY}
          AND "createdAt" >= ${customFrom} AND "createdAt" <= ${customTo}) AS orders_custom,
      (SELECT count(*)::int FROM "FinancialDocument"
        WHERE category = 'הכנסה' AND "sentToCpa" = true
          AND (("docDate" >= (${today0} AT TIME ZONE 'UTC')::date AND "docDate" <= (${todayEnd} AT TIME ZONE 'UTC')::date)
            OR ("docDate" IS NULL AND "createdAt" >= ${today0} AND "createdAt" <= ${todayEnd}))) AS documented_today,
      (SELECT count(*)::int FROM "FinancialDocument"
        WHERE category = 'הכנסה' AND "sentToCpa" = true
          AND (("docDate" >= (${weekFrom} AT TIME ZONE 'UTC')::date AND "docDate" <= (${todayEnd} AT TIME ZONE 'UTC')::date)
            OR ("docDate" IS NULL AND "createdAt" >= ${weekFrom} AND "createdAt" <= ${todayEnd}))) AS documented_week,
      (SELECT count(*)::int FROM "FinancialDocument"
        WHERE category = 'הכנסה' AND "sentToCpa" = true
          AND (("docDate" >= (${monthFrom} AT TIME ZONE 'UTC')::date AND "docDate" <= (${monthTo} AT TIME ZONE 'UTC')::date)
            OR ("docDate" IS NULL AND "createdAt" >= ${monthFrom} AND "createdAt" <= ${monthTo}))) AS documented_month,
      (SELECT count(*)::int FROM "FinancialDocument"
        WHERE category = 'הכנסה' AND "sentToCpa" = true
          AND (("docDate" >= (${customFrom} AT TIME ZONE 'UTC')::date AND "docDate" <= (${customTo} AT TIME ZONE 'UTC')::date)
            OR ("docDate" IS NULL AND "createdAt" >= ${customFrom} AND "createdAt" <= ${customTo}))) AS documented_custom,
      (SELECT count(*)::int FROM "Customer" WHERE "createdAt" >= ${nowStart}) AS new_customers,
      (SELECT count(*)::int FROM "TaskGroup"
        WHERE "dueDate" < ${widgetToday}
          AND status NOT IN ('COMPLETED', 'ARCHIVED')) AS overdue_tasks,
      (SELECT count(*)::int FROM "CheckPayment"
        WHERE status = 'PENDING' AND "dueDate" <= ${horizon}) AS pending_checks,
      (SELECT count(*)::int FROM "FutureOrder"
        WHERE "isCompleted" = false
          AND status NOT IN ('COMPLETED', 'CANCELLED')
          AND "eventDate" >= ${widgetToday}
          AND "eventDate" <= ${orderMax}) AS upcoming_orders,
      (SELECT LEAST(40, count(*)::int) FROM "InventoryProduct" p
        WHERE EXISTS (
          SELECT 1 FROM "InventoryCount" c
          WHERE c."inventoryProductId" = p.id AND c.difference < 0
        )) AS shortage_count,
      (SELECT coalesce(json_agg(json_build_object(
          'userId', s."userId",
          'startTime', s."startTime",
          'isActive', u."isActive"
        )), '[]'::json)
        FROM "WorkShift" s
        JOIN "User" u ON u.id = s."userId"
        WHERE s."workDate" = ${workDate} AND s.status = 'scheduled') AS late_shifts,
      (SELECT coalesce(json_agg(a."userId"), '[]'::json)
        FROM "Attendance" a
        WHERE a."workDate" = ${workDate}) AS late_attendance,
      (SELECT coalesce(json_agg(json_build_object(
          'entryType', e."entryType",
          'amount', e.amount,
          'entryDate', e."entryDate",
          'paymentMethod', e."paymentMethod",
          'source', e.source,
          'zReportId', e."zReportId",
          'expenseType', e."expenseType",
          'documentId', e."documentId",
          'documentDocDate', d."docDate"
        )), '[]'::json)
        FROM "CashFlowEntry" e
        LEFT JOIN "FinancialDocument" d ON d.id = e."documentId"
        WHERE e."entryDate" >= ${cashFrom}
          OR (d."docDate" IS NOT NULL
            AND d."docDate" >= (${cashFrom} AT TIME ZONE 'UTC')::date
            AND d."docDate" <= (${customTo} AT TIME ZONE 'UTC')::date)) AS cash_rows,
      (SELECT coalesce(json_agg(json_build_object('id', d.id, 'metadata', d.metadata)), '[]'::json)
        FROM "FinancialDocument" d
        WHERE d.id IN (
          SELECT DISTINCT e."documentId"
          FROM "CashFlowEntry" e
          LEFT JOIN "FinancialDocument" fd ON fd.id = e."documentId"
          WHERE (
              e."entryDate" >= ${cashFrom}
              OR (fd."docDate" IS NOT NULL
                AND fd."docDate" >= (${cashFrom} AT TIME ZONE 'UTC')::date
                AND fd."docDate" <= (${customTo} AT TIME ZONE 'UTC')::date)
            )
            AND e."expenseType" IS NULL
            AND e."documentId" IS NOT NULL
        )) AS cash_meta,
      (SELECT coalesce(json_agg(json_build_object(
          'id', d.id,
          'title', d.title,
          'paymentStatus', d."paymentStatus",
          'totalAmount', d."totalAmount",
          'paidAmount', d."paidAmount",
          'remainingAmount', d."remainingAmount",
          'documentType', d."documentType",
          'docDate', d."docDate",
          'metadata', d.metadata,
          'customer', CASE WHEN c.id IS NULL THEN NULL ELSE json_build_object('name', c.name) END
        )), '[]'::json)
        FROM "FinancialDocument" d
        LEFT JOIN "Customer" c ON c.id = d."customerId"
        WHERE d.category = 'הכנסה') AS income_docs,
      (SELECT coalesce(json_agg(json_build_object(
          'id', d.id,
          'title', d.title,
          'totalAmount', d."totalAmount",
          'depositAmount', d."depositAmount",
          'paidAmount', d."paidAmount",
          'remainingAmount', d."remainingAmount",
          'paymentStatus', d."paymentStatus",
          'metadata', d.metadata,
          'docDate', d."docDate",
          'supplierId', d."supplierId",
          'supplier', CASE WHEN s.id IS NULL THEN NULL ELSE json_build_object('name', s.name) END,
          'employee', CASE WHEN emp.id IS NULL THEN NULL ELSE json_build_object('name', emp.name) END
        )), '[]'::json)
        FROM "FinancialDocument" d
        LEFT JOIN "Supplier" s ON s.id = d."supplierId"
        LEFT JOIN "Employee" emp ON emp.id = d."employeeId"
        WHERE d.category = 'הוצאה') AS expense_docs,
      (SELECT coalesce(json_agg(x), '[]'::json) FROM (
        SELECT json_build_object(
          'id', o.id,
          'orderNumber', o."orderNumber",
          'customerName', o."customerName",
          'orderCategory', o."orderCategory",
          'eventDate', o."eventDate",
          'depositAmount', o."depositAmount",
          'depositPaid', o."depositPaid",
          'remainingAmount', o."remainingAmount",
          'status', o.status,
          'isCompleted', o."isCompleted"
        ) AS x
        FROM "FutureOrder" o
        WHERE o."isCompleted" = false
          AND o.status NOT IN ('COMPLETED', 'CANCELLED')
          AND (
            (o."orderCategory" = ${ORDER_CATEGORY_WEDDING} AND o."eventDate" >= ${today0} AND o."eventDate" < ${weddingHorizon})
            OR (o."orderCategory" = ${ORDER_CATEGORY_WEDDING} AND o."remainingAmount" > 0.000001)
            OR (o."orderCategory" = ${ORDER_CATEGORY_WEDDING} AND o."depositAmount" <= 0 AND o."depositPaid" = false)
            OR (o."orderCategory" = ${ORDER_CATEGORY_DAILY} AND o."eventDate" >= ${today0} AND o."eventDate" < ${dailyHorizon})
          )
        LIMIT 80
      ) q) AS alert_orders,
      (SELECT coalesce(json_agg(json_build_object(
          'status', t.status,
          'targetDueAt', t."targetDueAt",
          'completedAt', t."completedAt"
        )), '[]'::json)
        FROM "EmployeeTask" t
        WHERE (t."completedAt" >= ${today0} AND t."completedAt" <= ${todayEnd})
          OR (t.status IN ('PENDING', 'IN_PROGRESS') AND t."targetDueAt" <= ${todayEnd})) AS employee_tasks,
      (SELECT coalesce(json_agg(json_build_object(
          'id', ck.id,
          'amount', ck.amount,
          'dueDate', ck."dueDate",
          'checkNumber', ck."checkNumber",
          'documentId', ck."documentId",
          'customer', CASE WHEN cu.id IS NULL THEN NULL ELSE json_build_object('name', cu.name) END
        )), '[]'::json)
        FROM "CheckPayment" ck
        LEFT JOIN "Customer" cu ON cu.id = ck."customerId"
        WHERE ck.status IN (${openCheckStatuses[0]}, ${openCheckStatuses[1]})) AS open_checks,
      (SELECT coalesce(json_agg(json_build_object(
          'id', o.id,
          'orderNumber', o."orderNumber",
          'customerName', o."customerName",
          'remainingAmount', o."remainingAmount",
          'depositAmount', o."depositAmount",
          'depositPaid', o."depositPaid",
          'eventDate', o."eventDate",
          'orderCategory', o."orderCategory"
        )), '[]'::json)
        FROM "FutureOrder" o
        WHERE o."isCompleted" = false
          AND o.status NOT IN ('COMPLETED', 'CANCELLED')
          AND o."remainingAmount" > 0.01) AS forecast_orders,
      (SELECT json_build_object(
          'forecastBankBalance', fs."forecastBankBalance",
          'forecastManualEntries', fs."forecastManualEntries"
        )
        FROM "FinanceSettings" fs
        WHERE fs.id = 1) AS forecast_settings
  `;

  const row = rows[0];
  const cashRaw = parseJsonArray<Record<string, unknown>>(row?.cash_rows);
  const cashRows: CashRow[] = cashRaw.map((r) => ({
    entryType: String(r.entryType ?? ""),
    amount: Number(r.amount ?? 0),
    entryDate: asDate(r.entryDate),
    paymentMethod: r.paymentMethod == null ? null : String(r.paymentMethod),
    source: r.source == null ? null : String(r.source),
    zReportId: r.zReportId == null ? null : String(r.zReportId),
    expenseType: r.expenseType == null ? null : String(r.expenseType),
    documentId: r.documentId == null ? null : String(r.documentId),
    documentDocDate: asDateOrNull(r.documentDocDate),
  }));

  const metaByDocId = new Map<string, ExpenseType>();
  for (const d of parseJsonArray<{ id: string; metadata: unknown }>(row?.cash_meta)) {
    const meta = d.metadata as { expenseType?: unknown } | null;
    metaByDocId.set(d.id, normalizeExpenseType(meta?.expenseType));
  }

  const incomeDocs: IncomeForecastDoc[] = parseJsonArray<Record<string, unknown>>(row?.income_docs).map((d) => ({
    id: String(d.id),
    title: String(d.title ?? ""),
    paymentStatus: String(d.paymentStatus ?? ""),
    totalAmount: Number(d.totalAmount ?? 0),
    paidAmount: Number(d.paidAmount ?? 0),
    remainingAmount: Number(d.remainingAmount ?? 0),
    documentType: String(d.documentType ?? ""),
    docDate: asDateOrNull(d.docDate),
    metadata: d.metadata,
    customer: d.customer && typeof d.customer === "object" ? { name: String((d.customer as { name?: unknown }).name ?? "") } : null,
  }));

  const expenseDocs: ExpenseForecastDoc[] = parseJsonArray<Record<string, unknown>>(row?.expense_docs).map((d) => ({
    id: String(d.id),
    title: String(d.title ?? ""),
    totalAmount: Number(d.totalAmount ?? 0),
    depositAmount: Number(d.depositAmount ?? 0),
    paidAmount: Number(d.paidAmount ?? 0),
    remainingAmount: Number(d.remainingAmount ?? 0),
    paymentStatus: String(d.paymentStatus ?? ""),
    metadata: d.metadata,
    docDate: asDateOrNull(d.docDate),
    supplierId: d.supplierId == null ? null : String(d.supplierId),
    supplier: d.supplier && typeof d.supplier === "object" ? { name: String((d.supplier as { name?: unknown }).name ?? "") } : null,
    employee: d.employee && typeof d.employee === "object" ? { name: String((d.employee as { name?: unknown }).name ?? "") } : null,
  }));

  const checks: OpenCheckForecastRow[] = parseJsonArray<Record<string, unknown>>(row?.open_checks).map((c) => ({
    id: String(c.id),
    amount: Number(c.amount ?? 0),
    dueDate: asDate(c.dueDate),
    checkNumber: c.checkNumber == null ? null : String(c.checkNumber),
    documentId: c.documentId == null ? null : String(c.documentId),
    customer: c.customer && typeof c.customer === "object" ? { name: String((c.customer as { name?: unknown }).name ?? "") } : null,
  }));

  const forecastOrders: ForecastOrderRow[] = parseJsonArray<Record<string, unknown>>(row?.forecast_orders).map((o) => ({
    id: String(o.id),
    orderNumber: o.orderNumber as number | string,
    customerName: String(o.customerName ?? ""),
    remainingAmount: Number(o.remainingAmount ?? 0),
    depositAmount: Number(o.depositAmount ?? 0),
    depositPaid: Boolean(o.depositPaid),
    eventDate: asDate(o.eventDate),
    orderCategory: String(o.orderCategory ?? ""),
  }));

  const settingsRaw = row?.forecast_settings;
  const settingsObj =
    settingsRaw && typeof settingsRaw === "object"
      ? (settingsRaw as { forecastBankBalance?: unknown; forecastManualEntries?: unknown })
      : null;
  const settings: ForecastSettingsRow | null = settingsObj
    ? {
        forecastBankBalance:
          typeof settingsObj.forecastBankBalance === "number" ? settingsObj.forecastBankBalance : null,
        forecastManualEntries: settingsObj.forecastManualEntries,
      }
    : null;

  hydrateSharedForecastReads({
    income: incomeDocs,
    expense: expenseDocs,
    checks,
    orders: forecastOrders,
    settings,
  });

  const lateShifts = parseJsonArray<LateShiftRow>(row?.late_shifts);
  const lateAttendance = parseJsonArray<string>(row?.late_attendance);
  const clean = isSystemCleanMode();

  return {
    cashRows,
    metaByDocId,
    window: {
      zToday: Number(row?.z_today ?? 0),
      zWeek: Number(row?.z_week ?? 0),
      zMonth: Number(row?.z_month ?? 0),
      zCustom: Number(row?.z_custom ?? 0),
      weddingToday: {
        weddings: Number(row?.weddings_today ?? 0),
        orders: Number(row?.orders_today ?? 0),
        documented: Number(row?.documented_today ?? 0),
      },
      weddingWeek: {
        weddings: Number(row?.weddings_week ?? 0),
        orders: Number(row?.orders_week ?? 0),
        documented: Number(row?.documented_week ?? 0),
      },
      weddingMonth: {
        weddings: Number(row?.weddings_month ?? 0),
        orders: Number(row?.orders_month ?? 0),
        documented: Number(row?.documented_month ?? 0),
      },
      weddingCustom: {
        weddings: Number(row?.weddings_custom ?? 0),
        orders: Number(row?.orders_custom ?? 0),
        documented: Number(row?.documented_custom ?? 0),
      },
    },
    newCustomers: Number(row?.new_customers ?? 0),
    notifyWidgets: clean
      ? { lateEmployees: 0, overdueTasks: 0, pendingChecks: 0, upcomingOrders: 0 }
      : {
          lateEmployees: countLateEmployees(lateShifts, lateAttendance, nowMin),
          overdueTasks: Number(row?.overdue_tasks ?? 0),
          pendingChecks: Number(row?.pending_checks ?? 0),
          upcomingOrders: Number(row?.upcoming_orders ?? 0),
        },
    shortageCount: Number(row?.shortage_count ?? 0),
    alertOrders: parseJsonArray<Record<string, unknown>>(row?.alert_orders).map((o) => ({
      id: String(o.id),
      orderNumber: o.orderNumber as number | string,
      customerName: String(o.customerName ?? ""),
      orderCategory: String(o.orderCategory ?? ""),
      eventDate: asDate(o.eventDate),
      depositAmount: Number(o.depositAmount ?? 0),
      depositPaid: Boolean(o.depositPaid),
      remainingAmount: Number(o.remainingAmount ?? 0),
      status: String(o.status ?? ""),
      isCompleted: Boolean(o.isCompleted),
    })),
    employeeTasksToday: parseJsonArray<Record<string, unknown>>(row?.employee_tasks).map((t) => ({
      status: String(t.status ?? ""),
      targetDueAt: asDateOrNull(t.targetDueAt),
      completedAt: asDateOrNull(t.completedAt),
    })),
    incomeDocs,
    expenseDocs,
    dbQueries: 1,
  };
}

export function openInvoiceCountFromDocs(docs: IncomeForecastDoc[]): number {
  return docs.filter(isOpenInvoiceDoc).length;
}
