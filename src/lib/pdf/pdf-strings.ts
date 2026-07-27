import type { AppLocale } from "@/lib/i18n/constants";

/**
 * Every word the PDF engine itself prints, in all three supported languages. Documents look
 * strings up by key so a PDF is never hardcoded to one language.
 */

export type PdfStringKey =
  | "brandName"
  | "brandTagline"
  | "page"
  | "of"
  | "date"
  | "dateIssued"
  | "documentNumber"
  | "customer"
  | "supplier"
  | "description"
  | "quantity"
  | "unit"
  | "unitPrice"
  | "total"
  | "subtotal"
  | "vat"
  | "grandTotal"
  | "paid"
  | "openBalance"
  | "paymentMethod"
  | "notes"
  | "noRows"
  | "location"
  | "worker"
  | "product"
  | "counted"
  | "previous"
  | "difference"
  | "minimum"
  | "required"
  | "stockTotal"
  | "summary"
  | "details"
  | "reference"
  | "status"
  | "amount"
  | "balance"
  | "income"
  | "expense"
  | "generatedAt"
  // Daily inventory count summary
  | "report.countsPerformed"
  | "report.productsChecked"
  /** גרסאות קצרות לכותרות עמודה בטבלה צרה */
  | "report.countsShort"
  | "report.productsShort"
  | "report.addedShort"
  | "report.removedShort"
  | "report.statusCompleted"
  | "report.ok"
  | "report.shortage"
  | "report.surplus"
  | "report.anomalies"
  | "report.addedDuringCount"
  | "report.removedFromCount"
  | "report.totalCounted"
  | "report.counters"
  | "report.byLocation"
  | "report.sessionsDetail"
  | "report.linesDetail"
  | "report.removedDetail"
  | "report.sessionNumber"
  | "report.countedBy"
  | "report.startTime"
  | "report.endTime"
  | "report.duration"
  | "report.minutes"
  | "report.hours"
  | "report.reportPeriod"
  | "report.locationsCounted"
  | "report.totalDuration"
  | "report.avgDuration"
  | "report.notRecorded"
  | "report.removedBy"
  | "report.removedAt"
  | "report.reason"
  | "report.noCounts"
  | "report.linesTruncated"
  // Document titles
  | "doc.invoice"
  | "doc.receipt"
  | "doc.quote"
  | "doc.paymentDemand"
  | "doc.transactionAccount"
  | "doc.order"
  | "doc.deliveryNote"
  | "doc.inventoryCount"
  | "doc.inventoryReport"
  | "doc.inventoryDailyReport"
  | "doc.inventoryCountSummary"
  | "doc.salesReport"
  | "doc.profitLoss"
  | "doc.financialReport"
  | "doc.employeeReport"
  | "doc.cashflow"
  | "doc.payment"
  | "doc.generic";

type Catalog = Record<PdfStringKey, string>;

const he: Catalog = {
  brandName: "WEGO ERP",
  brandTagline: "מערכת ניהול פיננסי",
  page: "עמוד",
  of: "מתוך",
  date: "תאריך",
  dateIssued: "תאריך הפקה",
  documentNumber: "מספר מסמך",
  customer: "לקוח",
  supplier: "ספק",
  description: "תיאור",
  quantity: "כמות",
  unit: "יחידה",
  unitPrice: "מחיר ליחידה",
  total: "סה\u05F4כ",
  subtotal: "סכום לפני מע\u05F4מ",
  vat: "מע\u05F4מ",
  grandTotal: "סה\u05F4כ לתשלום",
  paid: "שולם",
  openBalance: "יתרה פתוחה",
  paymentMethod: "אמצעי תשלום",
  notes: "הערות",
  noRows: "אין נתונים להצגה",
  location: "מיקום",
  worker: "עובד",
  product: "מוצר",
  counted: "נספר",
  previous: "ספירה קודמת",
  difference: "הפרש",
  minimum: "מינימום",
  required: "כמות נדרשת",
  stockTotal: "סה\u05F4כ מלאי",
  summary: "סיכום",
  details: "פירוט",
  reference: "אסמכתא",
  status: "סטטוס",
  amount: "סכום",
  balance: "יתרה",
  income: "הכנסה",
  expense: "הוצאה",
  generatedAt: "הופק בתאריך",
  "report.countsPerformed": "ספירות שבוצעו",
  "report.productsChecked": "מוצרים שנבדקו",
  "report.countsShort": "ספירות",
  "report.productsShort": "מוצרים",
  "report.addedShort": "נוספו",
  "report.removedShort": "הוסרו",
  "report.statusCompleted": "הושלמה",
  "report.ok": "תקינים",
  "report.shortage": "חוסרים",
  "report.surplus": "עודפים",
  "report.anomalies": "חריגות",
  "report.addedDuringCount": "מוצרים שנוספו",
  "report.removedFromCount": "מוצרים שהוסרו",
  "report.totalCounted": "סה\u05F4כ יחידות שנספרו",
  "report.counters": "מבצעי הספירות",
  "report.byLocation": "חלוקה לפי מיקום אחסון",
  "report.sessionsDetail": "פירוט הספירות",
  "report.linesDetail": "פירוט המוצרים",
  "report.removedDetail": "מוצרים שהוסרו מהספירה",
  "report.sessionNumber": "מספר ספירה",
  "report.countedBy": "מבצע הספירה",
  "report.startTime": "שעת התחלה",
  "report.endTime": "שעת סיום",
  "report.duration": "משך",
  "report.minutes": "דק\u05F3",
  "report.hours": "שעות",
  "report.reportPeriod": "תקופת הדוח",
  "report.locationsCounted": "מיקומים שנספרו",
  "report.totalDuration": "זמן ספירה כולל",
  "report.avgDuration": "זמן ממוצע לספירה",
  "report.notRecorded": "לא תועד",
  "report.removedBy": "הוסר על ידי",
  "report.removedAt": "שעת הסרה",
  "report.reason": "סיבה",
  "report.noCounts": "לא בוצעו ספירות ביום זה",
  "report.linesTruncated": "הפירוט קוצר בשל מספר שורות גדול — הנתונים המלאים בקובץ Excel",
  "doc.invoice": "חשבונית",
  "doc.receipt": "קבלה",
  "doc.quote": "הצעת מחיר",
  "doc.paymentDemand": "דרישת תשלום",
  "doc.transactionAccount": "חשבון עסקה",
  "doc.order": "הזמנה",
  "doc.deliveryNote": "תעודת משלוח",
  "doc.inventoryCount": "דוח ספירת מלאי",
  "doc.inventoryReport": "דוח מלאי",
  "doc.inventoryDailyReport": "דוח סיכום ספירות יומי",
  "doc.inventoryCountSummary": "סיכום ספירות מלאי",
  "doc.salesReport": "דוח מכירות",
  "doc.profitLoss": "דוח רווח והפסד",
  "doc.financialReport": "דוח כספי",
  "doc.employeeReport": "דוח עובדים",
  "doc.cashflow": "יומן תנועות כספיות",
  "doc.payment": "קבלת תשלום",
  "doc.generic": "מסמך",
};

const ar: Catalog = {
  brandName: "WEGO ERP",
  brandTagline: "نظام الإدارة المالية",
  page: "صفحة",
  of: "من",
  date: "التاريخ",
  dateIssued: "تاريخ الإصدار",
  documentNumber: "رقم المستند",
  customer: "العميل",
  supplier: "المورّد",
  description: "الوصف",
  quantity: "الكمية",
  unit: "الوحدة",
  unitPrice: "سعر الوحدة",
  total: "المجموع",
  subtotal: "المجموع قبل الضريبة",
  vat: "ضريبة القيمة المضافة",
  grandTotal: "المجموع الإجمالي",
  paid: "المدفوع",
  openBalance: "الرصيد المتبقي",
  paymentMethod: "طريقة الدفع",
  notes: "ملاحظات",
  noRows: "لا توجد بيانات للعرض",
  location: "الموقع",
  worker: "العامل",
  product: "المنتج",
  counted: "المحسوب",
  previous: "الجرد السابق",
  difference: "الفرق",
  minimum: "الحد الأدنى",
  required: "الكمية المطلوبة",
  stockTotal: "إجمالي المخزون",
  summary: "الملخص",
  details: "التفاصيل",
  reference: "المرجع",
  status: "الحالة",
  amount: "المبلغ",
  balance: "الرصيد",
  income: "إيراد",
  expense: "مصروف",
  generatedAt: "تم الإصدار بتاريخ",
  "report.countsPerformed": "عمليات الجرد المنفذة",
  "report.productsChecked": "المنتجات التي تم جردها",
  "report.countsShort": "عمليات الجرد",
  "report.productsShort": "المنتجات",
  "report.addedShort": "أُضيفت",
  "report.removedShort": "أُزيلت",
  "report.statusCompleted": "مكتملة",
  "report.ok": "مطابقة",
  "report.shortage": "نواقص",
  "report.surplus": "زيادات",
  "report.anomalies": "انحرافات",
  "report.addedDuringCount": "منتجات أُضيفت",
  "report.removedFromCount": "منتجات أُزيلت",
  "report.totalCounted": "إجمالي الوحدات المحسوبة",
  "report.counters": "منفذو الجرد",
  "report.byLocation": "التوزيع حسب موقع التخزين",
  "report.sessionsDetail": "تفاصيل عمليات الجرد",
  "report.linesDetail": "تفاصيل المنتجات",
  "report.removedDetail": "منتجات أُزيلت من الجرد",
  "report.sessionNumber": "رقم الجرد",
  "report.countedBy": "منفذ الجرد",
  "report.startTime": "وقت البدء",
  "report.endTime": "وقت الانتهاء",
  "report.duration": "المدة",
  "report.minutes": "دقيقة",
  "report.hours": "ساعة",
  "report.reportPeriod": "فترة التقرير",
  "report.locationsCounted": "المواقع التي تم جردها",
  "report.totalDuration": "إجمالي وقت الجرد",
  "report.avgDuration": "متوسط وقت الجرد",
  "report.notRecorded": "غير مسجل",
  "report.removedBy": "أُزيل بواسطة",
  "report.removedAt": "وقت الإزالة",
  "report.reason": "السبب",
  "report.noCounts": "لم يتم تنفيذ أي جرد في هذا اليوم",
  "report.linesTruncated":
    "تم اختصار التفاصيل بسبب كثرة الصفوف — البيانات الكاملة في ملف Excel",
  "doc.invoice": "فاتورة",
  "doc.receipt": "إيصال",
  "doc.quote": "عرض سعر",
  "doc.paymentDemand": "مطالبة بالدفع",
  "doc.transactionAccount": "حساب معاملة",
  "doc.order": "طلب",
  "doc.deliveryNote": "سند تسليم",
  "doc.inventoryCount": "تقرير جرد المخزون",
  "doc.inventoryReport": "تقرير المخزون",
  "doc.inventoryDailyReport": "تقرير ملخص الجرد اليومي",
  "doc.inventoryCountSummary": "ملخص جرد المخزون",
  "doc.salesReport": "تقرير المبيعات",
  "doc.profitLoss": "تقرير الأرباح والخسائر",
  "doc.financialReport": "تقرير مالي",
  "doc.employeeReport": "تقرير الموظفين",
  "doc.cashflow": "سجل الحركات المالية",
  "doc.payment": "إشعار استلام دفعة",
  "doc.generic": "مستند",
};

const en: Catalog = {
  brandName: "WEGO ERP",
  brandTagline: "Financial Management System",
  page: "Page",
  of: "of",
  date: "Date",
  dateIssued: "Issue date",
  documentNumber: "Document no.",
  customer: "Customer",
  supplier: "Supplier",
  description: "Description",
  quantity: "Quantity",
  unit: "Unit",
  unitPrice: "Unit price",
  total: "Total",
  subtotal: "Subtotal",
  vat: "VAT",
  grandTotal: "Grand total",
  paid: "Paid",
  openBalance: "Open balance",
  paymentMethod: "Payment method",
  notes: "Notes",
  noRows: "No data to display",
  location: "Location",
  worker: "Worker",
  product: "Product",
  counted: "Counted",
  previous: "Previous count",
  difference: "Difference",
  minimum: "Minimum",
  required: "Required qty",
  stockTotal: "Total stock",
  summary: "Summary",
  details: "Details",
  reference: "Reference",
  status: "Status",
  amount: "Amount",
  balance: "Balance",
  income: "Income",
  expense: "Expense",
  generatedAt: "Generated on",
  "report.countsPerformed": "Counts performed",
  "report.productsChecked": "Products checked",
  "report.countsShort": "Counts",
  "report.productsShort": "Products",
  "report.addedShort": "Added",
  "report.removedShort": "Removed",
  "report.statusCompleted": "Completed",
  "report.ok": "Matching",
  "report.shortage": "Shortages",
  "report.surplus": "Surpluses",
  "report.anomalies": "Anomalies",
  "report.addedDuringCount": "Products added",
  "report.removedFromCount": "Products removed",
  "report.totalCounted": "Total units counted",
  "report.counters": "Counted by",
  "report.byLocation": "Breakdown by storage location",
  "report.sessionsDetail": "Count details",
  "report.linesDetail": "Product details",
  "report.removedDetail": "Products removed from the count",
  "report.sessionNumber": "Count no.",
  "report.countedBy": "Counted by",
  "report.startTime": "Start time",
  "report.endTime": "End time",
  "report.duration": "Duration",
  "report.minutes": "min",
  "report.hours": "h",
  "report.reportPeriod": "Report period",
  "report.locationsCounted": "Locations counted",
  "report.totalDuration": "Total count time",
  "report.avgDuration": "Average per count",
  "report.notRecorded": "Not recorded",
  "report.removedBy": "Removed by",
  "report.removedAt": "Removed at",
  "report.reason": "Reason",
  "report.noCounts": "No counts were performed on this day",
  "report.linesTruncated":
    "Details were truncated because of the number of rows — full data is in the Excel file",
  "doc.invoice": "Invoice",
  "doc.receipt": "Receipt",
  "doc.quote": "Quotation",
  "doc.paymentDemand": "Payment demand",
  "doc.transactionAccount": "Transaction account",
  "doc.order": "Order",
  "doc.deliveryNote": "Delivery note",
  "doc.inventoryCount": "Inventory count report",
  "doc.inventoryReport": "Inventory report",
  "doc.inventoryDailyReport": "Daily inventory count summary",
  "doc.inventoryCountSummary": "Inventory count summary",
  "doc.salesReport": "Sales report",
  "doc.profitLoss": "Profit & loss report",
  "doc.financialReport": "Financial report",
  "doc.employeeReport": "Employee report",
  "doc.cashflow": "Cash flow journal",
  "doc.payment": "Payment receipt",
  "doc.generic": "Document",
};

const CATALOGS: Record<AppLocale, Catalog> = { he, ar, en };

export type PdfTranslator = (key: PdfStringKey) => string;

export function pdfTranslator(locale: AppLocale): PdfTranslator {
  const catalog = CATALOGS[locale] ?? he;
  return (key) => catalog[key] ?? he[key] ?? key;
}
