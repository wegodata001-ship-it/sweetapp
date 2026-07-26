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
  | "doc.salesReport"
  | "doc.profitLoss"
  | "doc.financialReport"
  | "doc.employeeReport"
  | "doc.cashflow"
  | "doc.reconciliation"
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
  "doc.invoice": "חשבונית",
  "doc.receipt": "קבלה",
  "doc.quote": "הצעת מחיר",
  "doc.paymentDemand": "דרישת תשלום",
  "doc.transactionAccount": "חשבון עסקה",
  "doc.order": "הזמנה",
  "doc.deliveryNote": "תעודת משלוח",
  "doc.inventoryCount": "דוח ספירת מלאי",
  "doc.inventoryReport": "דוח מלאי",
  "doc.salesReport": "דוח מכירות",
  "doc.profitLoss": "דוח רווח והפסד",
  "doc.financialReport": "דוח כספי",
  "doc.employeeReport": "דוח עובדים",
  "doc.cashflow": "יומן תנועות כספיות",
  "doc.reconciliation": "דוח התאמת מערכות",
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
  "doc.invoice": "فاتورة",
  "doc.receipt": "إيصال",
  "doc.quote": "عرض سعر",
  "doc.paymentDemand": "مطالبة بالدفع",
  "doc.transactionAccount": "حساب معاملة",
  "doc.order": "طلب",
  "doc.deliveryNote": "سند تسليم",
  "doc.inventoryCount": "تقرير جرد المخزون",
  "doc.inventoryReport": "تقرير المخزون",
  "doc.salesReport": "تقرير المبيعات",
  "doc.profitLoss": "تقرير الأرباح والخسائر",
  "doc.financialReport": "تقرير مالي",
  "doc.employeeReport": "تقرير الموظفين",
  "doc.cashflow": "سجل الحركات المالية",
  "doc.reconciliation": "تقرير مطابقة الأنظمة",
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
  "doc.invoice": "Invoice",
  "doc.receipt": "Receipt",
  "doc.quote": "Quotation",
  "doc.paymentDemand": "Payment demand",
  "doc.transactionAccount": "Transaction account",
  "doc.order": "Order",
  "doc.deliveryNote": "Delivery note",
  "doc.inventoryCount": "Inventory count report",
  "doc.inventoryReport": "Inventory report",
  "doc.salesReport": "Sales report",
  "doc.profitLoss": "Profit & loss report",
  "doc.financialReport": "Financial report",
  "doc.employeeReport": "Employee report",
  "doc.cashflow": "Cash flow journal",
  "doc.reconciliation": "System reconciliation report",
  "doc.payment": "Payment receipt",
  "doc.generic": "Document",
};

const CATALOGS: Record<AppLocale, Catalog> = { he, ar, en };

export type PdfTranslator = (key: PdfStringKey) => string;

export function pdfTranslator(locale: AppLocale): PdfTranslator {
  const catalog = CATALOGS[locale] ?? he;
  return (key) => catalog[key] ?? he[key] ?? key;
}
