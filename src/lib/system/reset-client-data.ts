/**
 * איפוס נתוני עסקים לפני מסירה ללקוח — שומר users, קטלוגים, templates.
 */
import { prisma } from "@/lib/prisma";

export type ClientResetStats = Record<string, number>;

async function del(model: string, fn: () => Promise<{ count: number }>, stats: ClientResetStats) {
  const r = await fn();
  stats[model] = r.count;
}

async function safeCount(fn: () => Promise<number>): Promise<number> {
  try {
    return await fn();
  } catch (e) {
    console.warn("[BACKUP] count skip:", e instanceof Error ? e.message : e);
    return 0;
  }
}

/** ייצוא JSON לגיבוי לפני reset */
export async function exportClientDataBackup(): Promise<Record<string, unknown>> {
  const counts = {
    financialDocuments: await safeCount(() => prisma.financialDocument.count()),
    payments: await safeCount(() => prisma.payment.count()),
    ledgerEntries: await safeCount(() => prisma.ledgerEntry.count()),
    cashFlow: await safeCount(() => prisma.cashFlowEntry.count()),
    checks: await safeCount(() => prisma.checkPayment.count()),
    customers: await safeCount(() => prisma.customer.count()),
    futureOrders: await safeCount(() => prisma.futureOrder.count()),
    notifications: await safeCount(() => prisma.notification.count()),
    employeeTasks: await safeCount(() => prisma.employeeTask.count()),
    taskGroups: await safeCount(() => prisma.taskGroup.count()),
    ocrCache: await safeCount(() => prisma.ocrCache.count()),
    activityLogs: await safeCount(() => prisma.activityLog.count()),
  };

  let financialDocuments: unknown[] = [];
  try {
    financialDocuments = await prisma.financialDocument.findMany({
      take: 500,
      select: {
        id: true,
        title: true,
        category: true,
        totalAmount: true,
        paymentStatus: true,
        remainingAmount: true,
        createdAt: true,
      },
    });
  } catch (e) {
    console.warn("[BACKUP] financialDocument sample skip:", e);
  }

  return {
    exportedAt: new Date().toISOString(),
    counts,
    financialDocumentsSample: financialDocuments,
  };
}

async function safeDel(
  model: string,
  fn: () => Promise<{ count: number }>,
  stats: ClientResetStats,
) {
  try {
    await del(model, fn, stats);
  } catch (e) {
    console.warn(`[CLIENT RESET] skip ${model}:`, e instanceof Error ? e.message : e);
    stats[model] = 0;
  }
}

export async function resetClientSystemData(): Promise<ClientResetStats> {
  const stats: ClientResetStats = {};

  await safeDel("checkNotificationLog", () => prisma.checkNotificationLog.deleteMany(), stats);
  await safeDel("checkPayment", () => prisma.checkPayment.deleteMany(), stats);
  await safeDel("payment", () => prisma.payment.deleteMany(), stats);
  await safeDel("financialDocumentItem", () => prisma.financialDocumentItem.deleteMany(), stats);
  await safeDel("accountantTransferLog", () => prisma.accountantTransferLog.deleteMany(), stats);
  await safeDel("cashFlowEntry", () => prisma.cashFlowEntry.deleteMany(), stats);
  await safeDel("workflowRunItem", () => prisma.workflowRunItem.deleteMany(), stats);
  await safeDel("workflowRun", () => prisma.workflowRun.deleteMany(), stats);
  await safeDel("taskFile", () => prisma.taskFile.deleteMany(), stats);
  await safeDel("taskGroupMember", () => prisma.taskGroupMember.deleteMany(), stats);
  await safeDel("employeeTask", () => prisma.employeeTask.deleteMany(), stats);
  await safeDel("taskGroup", () => prisma.taskGroup.deleteMany(), stats);
  await safeDel("employeeWorkSession", () => prisma.employeeWorkSession.deleteMany(), stats);
  await safeDel("recipeRunStep", () => prisma.recipeRunStep.deleteMany(), stats);
  await safeDel("recipeRun", () => prisma.recipeRun.deleteMany(), stats);
  await safeDel("workSession", () => prisma.workSession.deleteMany(), stats);
  await safeDel("notification", () => prisma.notification.deleteMany(), stats);
  await safeDel("staffAlert", () => prisma.staffAlert.deleteMany(), stats);
  await safeDel("attendanceEditLog", () => prisma.attendanceEditLog.deleteMany(), stats);
  await safeDel("attendance", () => prisma.attendance.deleteMany(), stats);
  await safeDel("workShift", () => prisma.workShift.deleteMany(), stats);
  await safeDel("activityLog", () => prisma.activityLog.deleteMany(), stats);
  await safeDel("loginAudit", () => prisma.loginAudit.deleteMany(), stats);
  await safeDel("emailLog", () => prisma.emailLog.deleteMany(), stats);
  try {
    await del("ocrCache", () => prisma.ocrCache.deleteMany(), stats);
  } catch {
    stats.ocrCache = 0;
  }
  await safeDel("generatedPdf", () => prisma.generatedPdf.deleteMany(), stats);
  await safeDel("generatedReport", () => prisma.generatedReport.deleteMany(), stats);
  await safeDel("inventoryMovement", () => prisma.inventoryMovement.deleteMany(), stats);
  await safeDel("inventoryCount", () => prisma.inventoryCount.deleteMany(), stats);
  await safeDel("productHistory", () => prisma.productHistory.deleteMany(), stats);
  await safeDel("supplierProductPriceHistory", () => prisma.supplierProductPriceHistory.deleteMany(), stats);
  await safeDel("ledgerEntry", () => prisma.ledgerEntry.deleteMany(), stats);
  await safeDel("financialDocument", () => prisma.financialDocument.deleteMany(), stats);
  await safeDel("futureOrder", () => prisma.futureOrder.deleteMany(), stats);
  await safeDel("customer", () => prisma.customer.deleteMany(), stats);
  await safeDel("passwordResetToken", () => prisma.passwordResetToken.deleteMany(), stats);

  await prisma.customer.updateMany({ data: { openingBalance: 0 } });
  await prisma.supplier.updateMany({ data: { openingBalance: 0 } });
  await prisma.employee.updateMany({ data: { openingBalance: 0 } });
  stats.openingBalancesReset = 3;

  const g = globalThis as typeof globalThis & { __wegoOcrCacheMem?: Map<string, unknown> };
  if (g.__wegoOcrCacheMem) {
    g.__wegoOcrCacheMem.clear();
    stats.ocrMemoryCache = 1;
  }

  console.log("[CLIENT RESET] completed", stats);
  return stats;
}
