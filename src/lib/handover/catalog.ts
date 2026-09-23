/**
 * Client handover catalog.
 * 71 Prisma models − PasswordResetToken = 70 exportable client models.
 * Approved map said 69 (off-by-one). Tests cover every remaining model.
 */

export const EXPORT_CURRENCY = "ILS";
export const APPROVED_MAP_CLIENT_COUNT = 69;
export const EXCLUDED_MODELS = ["PasswordResetToken"] as const;
export const USER_EXCLUDED_FIELDS = ["passwordHash", "currentSessionId"] as const;

export const SECRET_ENV_NAMES = [
  "DATABASE_URL",
  "DIRECT_URL",
  "JWT_SECRET",
  "SUPER_ADMIN_PASSWORD",
  "SUPABASE_SERVICE_ROLE_KEY",
  "RESEND_API_KEY",
  "CRON_SECRET",
  "EMAIL_TEST_SECRET",
  "GEMINI_API_KEY",
  "WHATSAPP_TOKEN",
] as const;

export type HandoverFolder =
  | "CUSTOMERS"
  | "SUPPLIERS"
  | "EMPLOYEES"
  | "USERS"
  | "FINANCE"
  | "ORDERS"
  | "INVENTORY"
  | "TASKS"
  | "WORKFLOWS"
  | "DOCUMENTS"
  | "REPORTS"
  | "SYSTEM"
  | "OTHER";

export type FileRefField = {
  bucketField?: string;
  pathField: string;
  fallbackBucket?: "reports" | "source";
};

export type FkRule = {
  model: string;
  field: string;
  targetModel: string;
  targetField: string;
  optional: boolean;
};

export type ClientModelDef = {
  model: string;
  prisma: string;
  idField: string;
  folder: HandoverFolder;
  amountFields: string[];
  fileRefs: FileRefField[];
  excludeFields: string[];
};

export const CLIENT_MODELS: ClientModelDef[] = [
  { model: "Customer", prisma: "customer", idField: "id", folder: "CUSTOMERS", amountFields: ["openingBalance"], fileRefs: [], excludeFields: [] },
  { model: "Supplier", prisma: "supplier", idField: "id", folder: "SUPPLIERS", amountFields: ["openingBalance"], fileRefs: [], excludeFields: [] },
  { model: "SupplierProduct", prisma: "supplierProduct", idField: "id", folder: "SUPPLIERS", amountFields: ["regularPrice"], fileRefs: [], excludeFields: [] },
  { model: "SupplierProductPriceHistory", prisma: "supplierProductPriceHistory", idField: "id", folder: "SUPPLIERS", amountFields: ["price"], fileRefs: [], excludeFields: [] },
  { model: "Employee", prisma: "employee", idField: "id", folder: "EMPLOYEES", amountFields: ["openingBalance", "hourlyRate"], fileRefs: [], excludeFields: [] },
  { model: "User", prisma: "user", idField: "id", folder: "USERS", amountFields: ["hourlyRate"], fileRefs: [], excludeFields: [...USER_EXCLUDED_FIELDS] },
  { model: "UserPermission", prisma: "userPermission", idField: "id", folder: "USERS", amountFields: [], fileRefs: [], excludeFields: [] },
  { model: "LedgerEntry", prisma: "ledgerEntry", idField: "id", folder: "FINANCE", amountFields: ["debit", "credit"], fileRefs: [], excludeFields: [] },
  { model: "FinancialDocument", prisma: "financialDocument", idField: "id", folder: "FINANCE", amountFields: ["totalAmount", "paidAmount", "remainingAmount", "depositAmount"], fileRefs: [{ pathField: "pdfStoragePath", fallbackBucket: "reports" }], excludeFields: [] },
  { model: "FinancialDocumentItem", prisma: "financialDocumentItem", idField: "id", folder: "FINANCE", amountFields: ["unitPrice", "total"], fileRefs: [], excludeFields: [] },
  { model: "Payment", prisma: "payment", idField: "id", folder: "FINANCE", amountFields: ["amount"], fileRefs: [], excludeFields: [] },
  { model: "CheckPayment", prisma: "checkPayment", idField: "id", folder: "FINANCE", amountFields: ["amount"], fileRefs: [], excludeFields: [] },
  { model: "CheckNotificationLog", prisma: "checkNotificationLog", idField: "id", folder: "FINANCE", amountFields: [], fileRefs: [], excludeFields: [] },
  { model: "CashFlowEntry", prisma: "cashFlowEntry", idField: "id", folder: "FINANCE", amountFields: ["amount"], fileRefs: [], excludeFields: [] },
  { model: "FinanceSettings", prisma: "financeSettings", idField: "id", folder: "FINANCE", amountFields: ["cashOpeningBalance", "forecastBankBalance"], fileRefs: [], excludeFields: [] },
  { model: "DocumentEmailContact", prisma: "documentEmailContact", idField: "id", folder: "FINANCE", amountFields: [], fileRefs: [], excludeFields: [] },
  { model: "AccountantTransferLog", prisma: "accountantTransferLog", idField: "id", folder: "FINANCE", amountFields: [], fileRefs: [], excludeFields: [] },
  { model: "AccountantEmailLog", prisma: "accountantEmailLog", idField: "id", folder: "FINANCE", amountFields: [], fileRefs: [], excludeFields: [] },
  { model: "FutureOrder", prisma: "futureOrder", idField: "id", folder: "ORDERS", amountFields: ["totalAmount", "depositAmount", "remainingAmount", "turkeyAmount"], fileRefs: [], excludeFields: [] },
  { model: "OrderPayment", prisma: "orderPayment", idField: "id", folder: "ORDERS", amountFields: ["amount"], fileRefs: [], excludeFields: [] },
  { model: "SystemReconciliationImport", prisma: "systemReconciliationImport", idField: "id", folder: "ORDERS", amountFields: [], fileRefs: [{ pathField: "filePath", fallbackBucket: "source" }], excludeFields: [] },
  { model: "SystemReconciliationRow", prisma: "systemReconciliationRow", idField: "id", folder: "ORDERS", amountFields: ["externalAmount", "differenceAmount"], fileRefs: [], excludeFields: [] },
  { model: "ProductCategory", prisma: "productCategory", idField: "id", folder: "INVENTORY", amountFields: [], fileRefs: [], excludeFields: [] },
  { model: "Warehouse", prisma: "warehouse", idField: "id", folder: "INVENTORY", amountFields: [], fileRefs: [], excludeFields: [] },
  { model: "Product", prisma: "product", idField: "id", folder: "INVENTORY", amountFields: [], fileRefs: [], excludeFields: [] },
  { model: "ProductHistory", prisma: "productHistory", idField: "id", folder: "INVENTORY", amountFields: [], fileRefs: [], excludeFields: [] },
  { model: "InventoryLocation", prisma: "inventoryLocation", idField: "id", folder: "INVENTORY", amountFields: [], fileRefs: [], excludeFields: [] },
  { model: "InventoryLocationWorker", prisma: "inventoryLocationWorker", idField: "id", folder: "INVENTORY", amountFields: [], fileRefs: [], excludeFields: [] },
  { model: "InventoryProduct", prisma: "inventoryProduct", idField: "id", folder: "INVENTORY", amountFields: ["minimumQuantity", "maximumQuantity"], fileRefs: [], excludeFields: [] },
  { model: "InventoryProductOnLocation", prisma: "inventoryProductOnLocation", idField: "id", folder: "INVENTORY", amountFields: ["minimumQuantity", "minimumSun", "minimumMon", "minimumTue", "minimumWed", "minimumThu", "minimumFri", "minimumSat"], fileRefs: [], excludeFields: [] },
  { model: "InventoryCountSession", prisma: "inventoryCountSession", idField: "id", folder: "INVENTORY", amountFields: ["totalCountedQty"], fileRefs: [], excludeFields: [] },
  { model: "InventoryCount", prisma: "inventoryCount", idField: "id", folder: "INVENTORY", amountFields: ["difference", "previousQuantity", "currentQuantity", "minimumQuantity"], fileRefs: [], excludeFields: [] },
  { model: "InventoryCountWorker", prisma: "inventoryCountWorker", idField: "id", folder: "INVENTORY", amountFields: ["countedQuantity"], fileRefs: [], excludeFields: [] },
  { model: "InventoryCountExclusion", prisma: "inventoryCountExclusion", idField: "id", folder: "INVENTORY", amountFields: [], fileRefs: [], excludeFields: [] },
  { model: "InventoryMovement", prisma: "inventoryMovement", idField: "id", folder: "INVENTORY", amountFields: [], fileRefs: [], excludeFields: [] },
  { model: "TaskTemplate", prisma: "taskTemplate", idField: "id", folder: "TASKS", amountFields: [], fileRefs: [], excludeFields: [] },
  { model: "WorkTemplate", prisma: "workTemplate", idField: "id", folder: "TASKS", amountFields: [], fileRefs: [], excludeFields: [] },
  { model: "WorkTemplateTask", prisma: "workTemplateTask", idField: "id", folder: "TASKS", amountFields: [], fileRefs: [], excludeFields: [] },
  { model: "EmployeeWorkSession", prisma: "employeeWorkSession", idField: "id", folder: "TASKS", amountFields: [], fileRefs: [], excludeFields: [] },
  { model: "EmployeeTaskGroup", prisma: "employeeTaskGroup", idField: "id", folder: "TASKS", amountFields: [], fileRefs: [], excludeFields: [] },
  { model: "EmployeeTask", prisma: "employeeTask", idField: "id", folder: "TASKS", amountFields: [], fileRefs: [], excludeFields: [] },
  { model: "TaskGroup", prisma: "taskGroup", idField: "id", folder: "TASKS", amountFields: [], fileRefs: [], excludeFields: [] },
  { model: "TaskGroupMember", prisma: "taskGroupMember", idField: "id", folder: "TASKS", amountFields: [], fileRefs: [], excludeFields: [] },
  { model: "TaskFile", prisma: "taskFile", idField: "id", folder: "TASKS", amountFields: [], fileRefs: [{ pathField: "storagePath", fallbackBucket: "reports" }, { pathField: "fileUrl" }], excludeFields: [] },
  { model: "WorkSession", prisma: "workSession", idField: "id", folder: "TASKS", amountFields: [], fileRefs: [], excludeFields: [] },
  { model: "WorkShift", prisma: "workShift", idField: "id", folder: "TASKS", amountFields: [], fileRefs: [], excludeFields: [] },
  { model: "Attendance", prisma: "attendance", idField: "id", folder: "TASKS", amountFields: [], fileRefs: [], excludeFields: [] },
  { model: "AttendanceEditLog", prisma: "attendanceEditLog", idField: "id", folder: "TASKS", amountFields: [], fileRefs: [], excludeFields: [] },
  { model: "DynamicFormField", prisma: "dynamicFormField", idField: "id", folder: "TASKS", amountFields: [], fileRefs: [], excludeFields: [] },
  { model: "WorkflowTask", prisma: "workflowTask", idField: "id", folder: "WORKFLOWS", amountFields: [], fileRefs: [], excludeFields: [] },
  { model: "WorkflowTemplate", prisma: "workflowTemplate", idField: "id", folder: "WORKFLOWS", amountFields: [], fileRefs: [], excludeFields: [] },
  { model: "WorkflowTemplateItem", prisma: "workflowTemplateItem", idField: "id", folder: "WORKFLOWS", amountFields: [], fileRefs: [], excludeFields: [] },
  { model: "WorkflowRun", prisma: "workflowRun", idField: "id", folder: "WORKFLOWS", amountFields: [], fileRefs: [], excludeFields: [] },
  { model: "WorkflowRunItem", prisma: "workflowRunItem", idField: "id", folder: "WORKFLOWS", amountFields: [], fileRefs: [], excludeFields: [] },
  { model: "Recipe", prisma: "recipe", idField: "id", folder: "WORKFLOWS", amountFields: [], fileRefs: [], excludeFields: [] },
  { model: "RecipeStep", prisma: "recipeStep", idField: "id", folder: "WORKFLOWS", amountFields: [], fileRefs: [], excludeFields: [] },
  { model: "RecipeRun", prisma: "recipeRun", idField: "id", folder: "WORKFLOWS", amountFields: [], fileRefs: [], excludeFields: [] },
  { model: "RecipeRunStep", prisma: "recipeRunStep", idField: "id", folder: "WORKFLOWS", amountFields: [], fileRefs: [], excludeFields: [] },
  { model: "DocumentUpload", prisma: "documentUpload", idField: "id", folder: "DOCUMENTS", amountFields: [], fileRefs: [{ pathField: "storagePath", bucketField: "storageBucket", fallbackBucket: "source" }, { pathField: "publicUrl" }], excludeFields: [] },
  { model: "GeneratedPdf", prisma: "generatedPdf", idField: "id", folder: "DOCUMENTS", amountFields: [], fileRefs: [{ pathField: "pdfUrl", fallbackBucket: "reports" }], excludeFields: [] },
  { model: "GeneratedReport", prisma: "generatedReport", idField: "id", folder: "DOCUMENTS", amountFields: [], fileRefs: [{ pathField: "filePath", fallbackBucket: "reports" }, { pathField: "publicUrl" }], excludeFields: [] },
  { model: "InventoryDailyReportRun", prisma: "inventoryDailyReportRun", idField: "id", folder: "REPORTS", amountFields: [], fileRefs: [], excludeFields: [] },
  { model: "LoginAudit", prisma: "loginAudit", idField: "id", folder: "SYSTEM", amountFields: [], fileRefs: [], excludeFields: [] },
  { model: "ActivityLog", prisma: "activityLog", idField: "id", folder: "SYSTEM", amountFields: [], fileRefs: [], excludeFields: [] },
  { model: "Notification", prisma: "notification", idField: "id", folder: "SYSTEM", amountFields: [], fileRefs: [], excludeFields: [] },
  { model: "StaffAlert", prisma: "staffAlert", idField: "id", folder: "SYSTEM", amountFields: [], fileRefs: [], excludeFields: [] },
  { model: "EmailLog", prisma: "emailLog", idField: "id", folder: "SYSTEM", amountFields: [], fileRefs: [], excludeFields: [] },
  { model: "SystemNotificationRecipient", prisma: "systemNotificationRecipient", idField: "id", folder: "SYSTEM", amountFields: [], fileRefs: [], excludeFields: [] },
  { model: "EmployeeNote", prisma: "employeeNote", idField: "id", folder: "SYSTEM", amountFields: [], fileRefs: [], excludeFields: [] },
  { model: "OcrCache", prisma: "ocrCache", idField: "fileHash", folder: "OTHER", amountFields: [], fileRefs: [], excludeFields: [] },
];

export const FK_RULES: FkRule[] = [
  { model: "Payment", field: "customerId", targetModel: "Customer", targetField: "id", optional: false },
  { model: "Payment", field: "documentId", targetModel: "FinancialDocument", targetField: "id", optional: true },
  { model: "FinancialDocument", field: "customerId", targetModel: "Customer", targetField: "id", optional: true },
  { model: "FinancialDocument", field: "supplierId", targetModel: "Supplier", targetField: "id", optional: true },
  { model: "FinancialDocument", field: "employeeId", targetModel: "Employee", targetField: "id", optional: true },
  { model: "FinancialDocumentItem", field: "documentId", targetModel: "FinancialDocument", targetField: "id", optional: false },
  { model: "LedgerEntry", field: "supplierId", targetModel: "Supplier", targetField: "id", optional: true },
  { model: "LedgerEntry", field: "employeeId", targetModel: "Employee", targetField: "id", optional: true },
  { model: "LedgerEntry", field: "financialDocumentId", targetModel: "FinancialDocument", targetField: "id", optional: true },
  { model: "CheckPayment", field: "customerId", targetModel: "Customer", targetField: "id", optional: false },
  { model: "CheckPayment", field: "paymentId", targetModel: "Payment", targetField: "id", optional: true },
  { model: "CheckPayment", field: "documentId", targetModel: "FinancialDocument", targetField: "id", optional: true },
  { model: "CheckNotificationLog", field: "checkId", targetModel: "CheckPayment", targetField: "id", optional: false },
  { model: "OrderPayment", field: "orderId", targetModel: "FutureOrder", targetField: "id", optional: false },
  { model: "SystemReconciliationRow", field: "importId", targetModel: "SystemReconciliationImport", targetField: "id", optional: false },
  { model: "UserPermission", field: "userId", targetModel: "User", targetField: "id", optional: false },
  { model: "User", field: "employeeId", targetModel: "Employee", targetField: "id", optional: true },
  { model: "InventoryCount", field: "inventoryProductId", targetModel: "InventoryProduct", targetField: "id", optional: false },
  { model: "InventoryCount", field: "sessionId", targetModel: "InventoryCountSession", targetField: "id", optional: true },
  { model: "InventoryCountWorker", field: "inventoryCountId", targetModel: "InventoryCount", targetField: "id", optional: false },
  { model: "EmployeeTask", field: "employeeId", targetModel: "Employee", targetField: "id", optional: false },
  { model: "TaskFile", field: "groupId", targetModel: "TaskGroup", targetField: "id", optional: false },
  { model: "DocumentUpload", field: "financialDocumentId", targetModel: "FinancialDocument", targetField: "id", optional: true },
  { model: "CashFlowEntry", field: "customerId", targetModel: "Customer", targetField: "id", optional: true },
  { model: "CashFlowEntry", field: "documentId", targetModel: "FinancialDocument", targetField: "id", optional: true },
  { model: "CashFlowEntry", field: "paymentId", targetModel: "Payment", targetField: "id", optional: true },
  { model: "CashFlowEntry", field: "orderPaymentId", targetModel: "OrderPayment", targetField: "id", optional: true },
  { model: "CashFlowEntry", field: "relatedOrderId", targetModel: "FutureOrder", targetField: "id", optional: true },
  { model: "SupplierProduct", field: "supplierId", targetModel: "Supplier", targetField: "id", optional: false },
  { model: "SupplierProductPriceHistory", field: "supplierProductId", targetModel: "SupplierProduct", targetField: "id", optional: false },
  { model: "RecipeStep", field: "recipeId", targetModel: "Recipe", targetField: "id", optional: false },
  { model: "RecipeRun", field: "recipeId", targetModel: "Recipe", targetField: "id", optional: false },
  { model: "RecipeRunStep", field: "recipeRunId", targetModel: "RecipeRun", targetField: "id", optional: false },
];

export function clientModelNames(): string[] {
  return CLIENT_MODELS.map((m) => m.model);
}

export function defFor(model: string): ClientModelDef | undefined {
  return CLIENT_MODELS.find((m) => m.model === model);
}

export function prismaModelsFromSchema(schema: string): string[] {
  return [...schema.matchAll(/^model\s+(\w+)\s*\{/gm)].map((m) => m[1]);
}
