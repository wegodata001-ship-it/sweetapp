/**
 * READ-ONLY model counts. Never prints DATABASE_URL.
 * Usage: npx tsx scripts/audit-handover-counts.ts
 */
import { prisma, prismaReady } from "../src/lib/prisma";

const MODELS = [
  "customer",
  "ocrCache",
  "supplier",
  "supplierProduct",
  "supplierProductPriceHistory",
  "employee",
  "ledgerEntry",
  "financialDocument",
  "documentUpload",
  "accountantTransferLog",
  "accountantEmailLog",
  "documentEmailContact",
  "financialDocumentItem",
  "payment",
  "checkPayment",
  "checkNotificationLog",
  "cashFlowEntry",
  "generatedPdf",
  "generatedReport",
  "productHistory",
  "productCategory",
  "warehouse",
  "product",
  "inventoryLocation",
  "inventoryLocationWorker",
  "inventoryProduct",
  "inventoryProductOnLocation",
  "inventoryCountSession",
  "inventoryCount",
  "inventoryCountWorker",
  "inventoryCountExclusion",
  "inventoryMovement",
  "taskTemplate",
  "workTemplate",
  "workTemplateTask",
  "employeeWorkSession",
  "employeeTaskGroup",
  "employeeTask",
  "taskGroup",
  "taskGroupMember",
  "taskFile",
  "futureOrder",
  "orderPayment",
  "systemReconciliationImport",
  "systemReconciliationRow",
  "workflowTask",
  "workflowTemplate",
  "workflowTemplateItem",
  "workflowRun",
  "workflowRunItem",
  "workSession",
  "dynamicFormField",
  "financeSettings",
  "user",
  "employeeNote",
  "loginAudit",
  "passwordResetToken",
  "workShift",
  "attendance",
  "attendanceEditLog",
  "staffAlert",
  "notification",
  "emailLog",
  "systemNotificationRecipient",
  "inventoryDailyReportRun",
  "userPermission",
  "activityLog",
  "recipe",
  "recipeStep",
  "recipeRun",
  "recipeRunStep",
] as const;

async function main() {
  if (!(await prismaReady())) {
    console.log("DB_READY: NO");
    process.exit(2);
  }
  const out: Record<string, number | string> = {};
  for (const name of MODELS) {
    const model = (prisma as unknown as Record<string, { count?: () => Promise<number> }>)[name];
    if (!model?.count) {
      out[name] = "NO_DELEGATE";
      continue;
    }
    try {
      out[name] = await model.count();
    } catch {
      out[name] = "COUNT_FAIL";
    }
  }
  console.log("DB_READY: YES");
  console.log(JSON.stringify(out, null, 2));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.log("DB_READY: FAIL");
  console.log(String(e instanceof Error ? e.message : e).replace(/postgres(?:ql)?:\/\/\S+/gi, "[redacted]"));
  process.exit(1);
});
