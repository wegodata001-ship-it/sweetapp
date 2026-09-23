import { createHash } from "node:crypto";
import JSZip from "jszip";
import { CLIENT_MODELS, EXPORT_CURRENCY } from "./catalog";
import { rowsToCsv, storageManifestCsv } from "./csv";
import { buildCustomerDerivedLedger } from "./derived-ledgers";
import { exportSummaryMd, validationReportMd } from "./docs";
import { businessExportExplainPdf } from "./explain-pdf";
import { EXPORT_VERSION, dateStamp } from "./package";
import type { ExportedModel } from "./prisma-export";
import { stableJson } from "./serialize";
import type { StorageManifestRow } from "./storage";
import { storageSummary } from "./storage";
import { buildValidationReport, type ValidationReport } from "./validate";
import { nameIndex, pickColumns, rowsToXlsx, safeHebrewFile } from "./xlsx-write";

export const BUSINESS_PACKAGE_PREFIX = "WEGO_נתוני_העסק";

export type BusinessExportPackage = {
  zip: Uint8Array;
  zipFileName: string;
  sha256: string;
  rootName: string;
  validation: ValidationReport;
  fileNames: string[];
};

function find(models: ExportedModel[], name: string): Record<string, unknown>[] {
  return models.find((m) => m.def.model === name)?.rows ?? [];
}

function isIncome(row: Record<string, unknown>): boolean {
  const cat = String(row.category ?? "");
  return cat === "הכנסה" || cat.toLowerCase() === "income";
}

function isExpense(row: Record<string, unknown>): boolean {
  const cat = String(row.category ?? "");
  return cat === "הוצאה" || cat.toLowerCase() === "expense" || Boolean(row.supplierId);
}

function xlsxFile(headers: string[], rows: unknown[][], sheet = "נתונים"): Uint8Array {
  return rowsToXlsx([{ name: sheet, headers, rows }]);
}

function classifyStorageFile(row: StorageManifestRow): string {
  const name = `${row.fileName} ${row.originalPath}`.toLowerCase();
  if (name.endsWith(".pdf") || name.includes(".pdf")) return "PDF";
  if (/\.(png|jpe?g|webp|gif|heic)$/i.test(row.fileName) || /image/i.test(name)) return "תמונות";
  if (row.dbModel === "GeneratedReport" || name.includes("report") || name.includes("דוח")) return "דוחות";
  return "קבצים";
}

export async function buildBusinessExportPackage(input: {
  models: ExportedModel[];
  storageFiles: Map<string, Uint8Array>;
  storageManifest: StorageManifestRow[];
  dictionaryMd: string;
  generatedAt?: Date;
  appVersion?: string;
}): Promise<BusinessExportPackage> {
  const generatedAt = input.generatedAt ?? new Date();
  const generatedAtIso = generatedAt.toISOString();
  const day = dateStamp(generatedAt);
  const rootName = `${BUSINESS_PACKAGE_PREFIX}_${day}`;
  const validation = buildValidationReport({
    models: input.models,
    approvedMapCount: 69,
  });
  const storageStats = storageSummary(input.storageManifest);
  const recordTotal = input.models.reduce((s, m) => s + m.rows.length, 0);

  const customers = find(input.models, "Customer");
  const suppliers = find(input.models, "Supplier");
  const employees = find(input.models, "Employee");
  const users = find(input.models, "User");
  const permissions = find(input.models, "UserPermission");
  const documents = find(input.models, "FinancialDocument");
  const items = find(input.models, "FinancialDocumentItem");
  const payments = find(input.models, "Payment");
  const ledger = find(input.models, "LedgerEntry");
  const cashflow = find(input.models, "CashFlowEntry");
  const orders = find(input.models, "FutureOrder");
  const orderPays = find(input.models, "OrderPayment");
  const products = find(input.models, "Product");
  const invProducts = find(input.models, "InventoryProduct");
  const locations = find(input.models, "InventoryLocation");
  const onLoc = find(input.models, "InventoryProductOnLocation");
  const sessions = find(input.models, "InventoryCountSession");
  const counts = find(input.models, "InventoryCount");
  const tasks = find(input.models, "EmployeeTask");
  const attendances = find(input.models, "Attendance");
  const settings = find(input.models, "FinanceSettings");
  const uploads = find(input.models, "DocumentUpload");
  const reports = find(input.models, "GeneratedReport");

  const customerNames = nameIndex(customers);
  const supplierNames = nameIndex(suppliers);
  const employeeNames = nameIndex(employees);
  const userNames = nameIndex(users, "id", "fullName");
  const locationNames = nameIndex(locations);
  const productNames = nameIndex(invProducts, "id", "name");

  const files = new Map<string, string | Uint8Array>();
  const put = (rel: string, body: string | Uint8Array) => {
    files.set(`${rootName}/${rel.replace(/^\/+/, "")}`, body);
  };

  const explain = await businessExportExplainPdf({
    generatedAt: generatedAtIso,
    modelCount: input.models.length,
    recordTotal,
  });
  put("00_קרא_אותי/הסבר_על_הנתונים.pdf", explain);

  const summaryRows = input.models.map((m) => [
    m.def.model,
    m.sourceCount,
    m.rows.length,
    m.sourceCount === m.rows.length ? "תקין" : "שגיאה",
  ]);
  put(
    "00_קרא_אותי/סיכום_הייצוא.xlsx",
    xlsxFile(["מודל", "במקור", "בייצוא", "סטטוס"], summaryRows, "סיכום"),
  );

  const customerSheet = pickColumns(customers, [
    { key: "name", header: "שם לקוח" },
    { key: "phone", header: "טלפון" },
    { key: "customerType", header: "סוג" },
    { key: "openingBalance", header: "יתרת פתיחה" },
    { key: "createdAt", header: "נוצר בתאריך" },
    { key: "id", header: "מזהה" },
  ]);
  put("01_לקוחות/לקוחות.xlsx", xlsxFile(customerSheet.headers, customerSheet.rows, "לקוחות"));

  const allLedgerLines: unknown[][] = [];
  for (const customer of customers) {
    const id = String(customer.id ?? "");
    const relatedDocs = documents.filter((d) => String(d.customerId ?? "") === id);
    const relatedPays = payments.filter((p) => String(p.customerId ?? "") === id);
    const derived = buildCustomerDerivedLedger({
      customerId: id,
      openingBalance: customer.openingBalance,
      documents: relatedDocs,
      payments: relatedPays,
    });
    const card = pickColumns(derived.lines as unknown as Record<string, unknown>[], [
      { key: "date", header: "תאריך" },
      { key: "kind", header: "סוג" },
      { key: "description", header: "תיאור" },
      { key: "debit", header: "חובה" },
      { key: "credit", header: "זכות" },
      { key: "sourceModel", header: "מקור" },
    ]);
    for (const line of card.rows) allLedgerLines.push([customer.name, ...line]);
    put(
      `01_לקוחות/כרטסות/${safeHebrewFile(String(customer.name ?? id))}.xlsx`,
      xlsxFile(card.headers, card.rows, "כרטסת"),
    );
  }
  put(
    "01_לקוחות/כרטסות_לקוחות.xlsx",
    xlsxFile(["לקוח", "תאריך", "סוג", "תיאור", "חובה", "זכות", "מקור"], allLedgerLines, "כרטסות"),
  );

  const supplierSheet = pickColumns(suppliers, [
    { key: "name", header: "שם ספק" },
    { key: "phone", header: "טלפון" },
    { key: "email", header: "אימייל" },
    { key: "openingBalance", header: "יתרת פתיחה" },
    { key: "notes", header: "הערות" },
    { key: "id", header: "מזהה" },
  ]);
  put("02_ספקים/ספקים.xlsx", xlsxFile(supplierSheet.headers, supplierSheet.rows, "ספקים"));
  const supplierLedger = pickColumns(ledger.filter((r) => r.supplierId), [
    { key: "entryDate", header: "תאריך" },
    { key: "supplierId", header: "ספק", map: (r) => supplierNames.get(String(r.supplierId ?? "")) ?? r.supplierId },
    { key: "docType", header: "סוג מסמך" },
    { key: "description", header: "תיאור" },
    { key: "debit", header: "חובה" },
    { key: "credit", header: "זכות" },
  ]);
  put("02_ספקים/כרטסות_ספקים.xlsx", xlsxFile(supplierLedger.headers, supplierLedger.rows, "כרטסות ספקים"));

  const employeeSheet = pickColumns(employees, [
    { key: "name", header: "שם עובד" },
    { key: "phone", header: "טלפון" },
    { key: "role", header: "תפקיד" },
    { key: "department", header: "מחלקה" },
    { key: "hourlyRate", header: "שכר לשעה" },
    { key: "openingBalance", header: "יתרת פתיחה" },
    { key: "isActive", header: "פעיל" },
    { key: "id", header: "מזהה" },
  ]);
  put("03_עובדים/עובדים.xlsx", xlsxFile(employeeSheet.headers, employeeSheet.rows, "עובדים"));
  const hours = pickColumns(attendances, [
    { key: "workDate", header: "תאריך" },
    { key: "userId", header: "עובד", map: (r) => userNames.get(String(r.userId ?? "")) ?? r.userId },
    { key: "clockIn", header: "כניסה" },
    { key: "clockOut", header: "יציאה" },
    { key: "workedMinutes", header: "דקות עבודה" },
    { key: "lateMinutes", header: "איחור" },
    { key: "overtimeMinutes", header: "שעות נוספות" },
  ]);
  put("03_עובדים/שעות_עבודה.xlsx", xlsxFile(hours.headers, hours.rows, "שעות"));
  const empPay = pickColumns(
    documents.filter((d) => d.employeeId),
    [
      { key: "docDate", header: "תאריך" },
      { key: "employeeId", header: "עובד", map: (r) => employeeNames.get(String(r.employeeId ?? "")) ?? r.employeeId },
      { key: "title", header: "תיאור" },
      { key: "totalAmount", header: "סכום" },
      { key: "documentType", header: "סוג" },
    ],
  );
  put("03_עובדים/תשלומים.xlsx", xlsxFile(empPay.headers, empPay.rows, "תשלומים"));

  const paySheet = pickColumns(payments, [
    { key: "createdAt", header: "תאריך" },
    { key: "customerId", header: "לקוח", map: (r) => customerNames.get(String(r.customerId ?? "")) ?? r.customerId },
    { key: "amount", header: "סכום" },
    { key: "paymentMethod", header: "אמצעי תשלום" },
    { key: "notes", header: "הערות" },
    { key: "id", header: "מזהה" },
  ]);
  put("04_כספים/תשלומים.xlsx", xlsxFile(paySheet.headers, paySheet.rows, "תשלומים"));

  const docCols = [
    { key: "docDate", header: "תאריך" },
    { key: "title", header: "כותרת" },
    { key: "documentType", header: "סוג מסמך" },
    { key: "customerId", header: "לקוח", map: (r: Record<string, unknown>) => customerNames.get(String(r.customerId ?? "")) ?? "" },
    { key: "supplierId", header: "ספק", map: (r: Record<string, unknown>) => supplierNames.get(String(r.supplierId ?? "")) ?? "" },
    { key: "totalAmount", header: "סכום" },
    { key: "paidAmount", header: "שולם" },
    { key: "remainingAmount", header: "יתרה" },
    { key: "paymentStatus", header: "סטטוס" },
  ];
  const income = pickColumns(documents.filter(isIncome), docCols);
  const expense = pickColumns(documents.filter(isExpense), docCols);
  const allDocs = pickColumns(documents, docCols);
  put("04_כספים/הכנסות.xlsx", xlsxFile(income.headers, income.rows, "הכנסות"));
  put("04_כספים/הוצאות.xlsx", xlsxFile(expense.headers, expense.rows, "הוצאות"));
  put("04_כספים/מסמכים_פיננסיים.xlsx", xlsxFile(allDocs.headers, allDocs.rows, "מסמכים"));
  const ledgerSheet = pickColumns(ledger, [
    { key: "entryDate", header: "תאריך" },
    { key: "docType", header: "סוג" },
    { key: "description", header: "תיאור" },
    { key: "debit", header: "חובה" },
    { key: "credit", header: "זכות" },
    { key: "supplierId", header: "ספק", map: (r) => supplierNames.get(String(r.supplierId ?? "")) ?? "" },
    { key: "employeeId", header: "עובד", map: (r) => employeeNames.get(String(r.employeeId ?? "")) ?? "" },
  ]);
  put("04_כספים/תנועות_כרטסת.xlsx", xlsxFile(ledgerSheet.headers, ledgerSheet.rows, "כרטסת"));
  const cashSheet = pickColumns(cashflow, [
    { key: "entryDate", header: "תאריך" },
    { key: "entryType", header: "סוג תנועה" },
    { key: "amount", header: "סכום" },
    { key: "description", header: "תיאור" },
    { key: "paymentMethod", header: "אמצעי" },
    { key: "customerName", header: "לקוח" },
    { key: "source", header: "מקור" },
  ]);
  put("04_כספים/תזרים.xlsx", xlsxFile(cashSheet.headers, cashSheet.rows, "תזרים"));

  const orderSheet = pickColumns(orders, [
    { key: "orderNumber", header: "מספר הזמנה" },
    { key: "customerName", header: "לקוח" },
    { key: "phone", header: "טלפון" },
    { key: "eventType", header: "סוג אירוע" },
    { key: "eventDate", header: "תאריך אירוע" },
    { key: "totalAmount", header: "סכום" },
    { key: "depositAmount", header: "מקדמה" },
    { key: "remainingAmount", header: "יתרה" },
    { key: "status", header: "סטטוס" },
  ]);
  const orderPaySheet = pickColumns(orderPays, [
    { key: "orderId", header: "הזמנה" },
    { key: "amount", header: "סכום" },
    { key: "kind", header: "סוג" },
    { key: "status", header: "סטטוס" },
  ]);
  put(
    "05_הזמנות/הזמנות.xlsx",
    rowsToXlsx([
      { name: "הזמנות", headers: orderSheet.headers, rows: orderSheet.rows },
      { name: "תשלומי הזמנה", headers: orderPaySheet.headers, rows: orderPaySheet.rows },
    ]),
  );

  const invName = (row: Record<string, unknown>) =>
    String(row.nameHe ?? row.name ?? row.nameEn ?? row.id ?? "");
  const productSheet = pickColumns(invProducts.length ? invProducts : products, [
    { key: "name", header: "מוצר", map: invName },
    { key: "sku", header: "מק״ט" },
    { key: "barcode", header: "ברקוד" },
    { key: "minimumQuantity", header: "מינימום" },
    { key: "maximumQuantity", header: "מקסימום" },
    { key: "currentStock", header: "מלאי נוכחי" },
    { key: "id", header: "מזהה" },
  ]);
  put("06_מלאי/מוצרים.xlsx", xlsxFile(productSheet.headers, productSheet.rows, "מוצרים"));
  const locSheet = pickColumns(locations, [
    { key: "name", header: "מיקום" },
    { key: "locationType", header: "סוג" },
    { key: "isActive", header: "פעיל" },
    { key: "id", header: "מזהה" },
  ]);
  put("06_מלאי/מקומות_אחסון.xlsx", xlsxFile(locSheet.headers, locSheet.rows, "מיקומים"));
  const latestByProduct = new Map<string, Record<string, unknown>>();
  for (const row of counts) {
    const pid = String(row.inventoryProductId ?? "");
    const prev = latestByProduct.get(pid);
    if (!prev || String(row.createdAt ?? "") > String(prev.createdAt ?? "")) {
      latestByProduct.set(pid, row);
    }
  }
  const currentStock = (invProducts.length ? invProducts : products).map((p) => {
    const latest = latestByProduct.get(String(p.id));
    return [invName(p), latest?.currentQuantity ?? p.currentStock ?? "", p.minimumQuantity ?? p.minStock ?? "", latest?.createdAt ?? ""];
  });
  put("06_מלאי/מלאי_נוכחי.xlsx", xlsxFile(["מוצר", "כמות אחרונה", "מינימום", "תאריך ספירה"], currentStock, "מלאי נוכחי"));
  const sessionSheet = pickColumns(sessions, [
    { key: "countDate", header: "תאריך ספירה" },
    { key: "status", header: "סטטוס" },
    { key: "totalCountedQty", header: "סה״כ נספר" },
    { key: "id", header: "מזהה" },
  ]);
  put("06_מלאי/ספירות_מלאי.xlsx", xlsxFile(sessionSheet.headers, sessionSheet.rows, "ספירות"));
  const countHist = pickColumns(counts, [
    { key: "createdAt", header: "תאריך" },
    { key: "inventoryProductId", header: "מוצר", map: (r) => productNames.get(String(r.inventoryProductId ?? "")) ?? r.inventoryProductId },
    { key: "locationId", header: "מיקום", map: (r) => locationNames.get(String(r.locationId ?? "")) ?? "" },
    { key: "previousQuantity", header: "קודם" },
    { key: "currentQuantity", header: "נוכחי" },
    { key: "difference", header: "הפרש" },
  ]);
  put("06_מלאי/היסטוריית_ספירות.xlsx", xlsxFile(countHist.headers, countHist.rows, "היסטוריה"));
  const placementSheet = pickColumns(onLoc, [
    { key: "inventoryProductId", header: "מוצר", map: (r) => productNames.get(String(r.inventoryProductId ?? "")) ?? r.inventoryProductId },
    { key: "locationId", header: "מיקום", map: (r) => locationNames.get(String(r.locationId ?? "")) ?? r.locationId },
    { key: "minimumQuantity", header: "מינימום" },
  ]);
  put("06_מלאי/שיוך_למיקומים.xlsx", xlsxFile(placementSheet.headers, placementSheet.rows, "שיוך"));
  const itemSheet = pickColumns(items, [
    { key: "documentId", header: "מסמך" },
    { key: "itemName", header: "תיאור" },
    { key: "unitPrice", header: "מחיר יחידה" },
    { key: "total", header: "סה״כ" },
  ]);
  put("04_כספים/שורות_מסמכים.xlsx", xlsxFile(itemSheet.headers, itemSheet.rows, "שורות"));

  const taskSheet = pickColumns(tasks, [
    { key: "title", header: "משימה" },
    { key: "employeeId", header: "עובד", map: (r) => employeeNames.get(String(r.employeeId ?? "")) ?? r.employeeId },
    { key: "status", header: "סטטוס" },
    { key: "createdAt", header: "תאריך" },
    { key: "completedAt", header: "הושלם" },
  ]);
  put("07_משימות/משימות.xlsx", xlsxFile(taskSheet.headers, taskSheet.rows, "משימות"));
  put("07_משימות/היסטוריית_משימות.xlsx", xlsxFile(taskSheet.headers, taskSheet.rows, "היסטוריה"));

  const uploadSheet = pickColumns(uploads, [
    { key: "fileName", header: "שם קובץ" },
    { key: "documentType", header: "סוג" },
    { key: "uploadedAt", header: "הועלה" },
    { key: "storagePath", header: "נתיב" },
  ]);
  const reportSheet = pickColumns(reports, [
    { key: "title", header: "דוח" },
    { key: "type", header: "סוג" },
    { key: "fileName", header: "קובץ" },
    { key: "createdAt", header: "נוצר" },
  ]);
  put(
    "08_מסמכים/רשימת_מסמכים.xlsx",
    rowsToXlsx([
      { name: "העלאות", headers: uploadSheet.headers, rows: uploadSheet.rows },
      { name: "דוחות", headers: reportSheet.headers, rows: reportSheet.rows },
    ]),
  );
  put("08_מסמכים/PDF/.gitkeep", "");
  put("08_מסמכים/קבצים/.gitkeep", "");
  put("08_מסמכים/תמונות/.gitkeep", "");
  put("08_מסמכים/דוחות/.gitkeep", "");

  const exportedByPath = new Map(input.storageManifest.filter((r) => r.status === "EXPORTED").map((r) => [r.exportedPath, r]));
  for (const [path, bytes] of input.storageFiles) {
    const row = exportedByPath.get(path);
    const folder = row ? classifyStorageFile(row) : "קבצים";
    const fileName = safeHebrewFile(row?.fileName || path.split("/").pop() || "file");
    put(`08_מסמכים/${folder}/${fileName}`, bytes);
  }

  const userSheet = pickColumns(users, [
    { key: "fullName", header: "שם" },
    { key: "email", header: "אימייל" },
    { key: "role", header: "תפקיד" },
    { key: "isActive", header: "פעיל" },
    { key: "createdAt", header: "נוצר" },
    { key: "id", header: "מזהה" },
  ]);
  put("09_מערכת/משתמשים.xlsx", xlsxFile(userSheet.headers, userSheet.rows, "משתמשים"));
  const roleSheet = pickColumns(permissions, [
    { key: "userId", header: "משתמש", map: (r) => userNames.get(String(r.userId ?? "")) ?? r.userId },
    { key: "permission", header: "הרשאה" },
  ]);
  put("09_מערכת/תפקידים.xlsx", xlsxFile(roleSheet.headers, roleSheet.rows, "תפקידים"));
  const settingsSheet = pickColumns(settings, [
    { key: "cashOpeningBalance", header: "יתרת פתיחה קופה" },
    { key: "forecastBankBalance", header: "יתרת בנק לתחזית" },
    { key: "id", header: "מזהה" },
  ]);
  put("09_מערכת/הגדרות_עסק.xlsx", xlsxFile(settingsSheet.headers, settingsSheet.rows, "הגדרות"));

  put("99_גיבוי_טכני/DATA_DICTIONARY.md", input.dictionaryMd);
  put(
    "99_גיבוי_טכני/EXPORT_SUMMARY.md",
    exportSummaryMd({
      generatedAt: generatedAtIso,
      exportVersion: EXPORT_VERSION,
      appVersion: input.appVersion ?? "0.1.0",
      modelCount: input.models.length,
      storage: storageStats,
      validation,
      realExport: true,
    }),
  );
  put(
    "99_גיבוי_טכני/VALIDATION_REPORT.md",
    validationReportMd({ validation, storage: storageStats, manifest: input.storageManifest }),
  );
  put("99_גיבוי_טכני/storage-manifest.csv", storageManifestCsv(input.storageManifest));

  for (const exported of input.models) {
    put(`99_גיבוי_טכני/database/${exported.def.model}.json`, stableJson(exported.rows));
    put(`99_גיבוי_טכני/database/${exported.def.model}.csv`, rowsToCsv(exported.rows));
  }

  const fileNames = [...files.keys()].map((k) => k.slice(rootName.length + 1)).sort();
  put(
    "99_גיבוי_טכני/manifest.json",
    stableJson({
      exportVersion: EXPORT_VERSION,
      generatedAt: generatedAtIso,
      currency: EXPORT_CURRENCY,
      packageKind: "business-friendly+technical",
      rootName,
      models: input.models.map((m) => ({ name: m.def.model, recordCount: m.rows.length })),
      recordCount: Object.fromEntries(input.models.map((m) => [m.def.model, m.rows.length])),
      fileNames,
      excludedFields: ["passwordHash", "currentSessionId"],
      excludedModels: ["PasswordResetToken"],
    }),
  );

  const zip = new JSZip();
  for (const [path, body] of files) zip.file(path, body);
  const zipBytes = await zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
  return {
    zip: zipBytes,
    zipFileName: `${rootName}.zip`,
    sha256: createHash("sha256").update(zipBytes).digest("hex"),
    rootName,
    validation,
    fileNames,
  };
}

export function businessExportCoveredFolders(): string[] {
  return [
    "00_קרא_אותי",
    "01_לקוחות",
    "02_ספקים",
    "03_עובדים",
    "04_כספים",
    "05_הזמנות",
    "06_מלאי",
    "07_משימות",
    "08_מסמכים",
    "09_מערכת",
    "99_גיבוי_טכני",
  ];
}

export function allClientModelsIncluded(): string[] {
  return CLIENT_MODELS.map((m) => m.model);
}
