import {
  documentTypeForEmployeePay,
  normalizeEmployeePayType,
  type EmployeePayType,
} from "@/lib/finance/employee-pay-types";
import { DEFAULT_EXPENSE_TYPE, normalizeExpenseType, type ExpenseType } from "@/lib/finance/expense-types";

export type { ExpenseType };

/** Israeli VAT rate for line calculations (decimal). */
export const VAT_RATE = 0.18;

/** Exact document type labels for commercial documents (Hebrew). */
/** אמצעי תשלום בכרטיס "פרטי תשלום" — לכל מסמך כספי */
export const PAYMENT_INSTRUMENT_OPTIONS = [
  "CASH",
  "CREDIT",
  "BANK",
  "BIT",
  "CHECK",
] as const;

export const PAYMENT_METHOD_LABELS: Record<(typeof PAYMENT_INSTRUMENT_OPTIONS)[number], string> = {
  CASH: "מזומן",
  CREDIT: "אשראי",
  BANK: "העברה",
  BIT: "ביט",
  CHECK: "צ׳ק",
};

export const DEPOSIT_TYPE_OPTIONS = [
  "TRAYS",
  "SERVING_TOOLS",
  "EVENT_EQUIPMENT",
  "CRATES",
  "OTHER",
] as const;

export const DEPOSIT_TYPE_LABELS: Record<(typeof DEPOSIT_TYPE_OPTIONS)[number], string> = {
  TRAYS: "מגשים",
  SERVING_TOOLS: "כלי הגשה",
  EVENT_EQUIPMENT: "ציוד אירועים",
  CRATES: "ארגזים",
  OTHER: "אחר",
};

export const DEPOSIT_STATUS_LABELS: Record<string, string> = {
  open: "פתוח",
  returned: "הוחזר",
  refunded: "הוחזר כסף",
};

export const DOCUMENT_TYPE_OPTIONS = [
  "חשבונית מס",
  "חשבונית מס קבלה",
  "תעודת משלוח",
  "הזמנה",
  "הצעת מחיר",
  "חשבונית זיכוי",
  "דרישת תשלום",
] as const;

export type ClientMode = "general" | "event";

export type VatMode = "includes_vat" | "before_vat" | "exempt";

export const VAT_MODE_LABELS: Record<VatMode, string> = {
  includes_vat: "כולל מע״מ",
  before_vat: "ללא מע״מ",
  exempt: "פטור ממע״מ",
};

export type FinanceLineItemPayload = {
  id: string;
  itemName: string;
  quantity: string;
  price: string;
  vatMode: VatMode;
  /** מזהה שורת מחירון ספק (כשבוחרים מוצר מהמחירון ברישום הוצאה) */
  supplierProductId?: string | null;
  /** Optional ephemeral hint produced by the OCR scan flow.
   *  Persisted in metadata so re-opening an edited expense keeps the warning
   *  badge until the user resaves with corrected values. */
  priceFlag?: {
    regularPrice: number | null;
    samples: number;
    flag: "higher" | "lower" | "match";
  } | null;
  /** הערה לשורה — תשלומי ספק */
  lineNote?: string;
};

export type PaymentCheckDetailsPayload = {
  checkNumber: string;
  bankName: string;
  branch: string;
  dueDate: string;
  holderName: string;
};

export type PaymentLinePayload = {
  id: string;
  instrument: string;
  amount: string;
  notes: string;
  check?: PaymentCheckDetailsPayload;
};

export function emptyCheckDetails(): PaymentCheckDetailsPayload {
  return { checkNumber: "", bankName: "", branch: "", dueDate: "", holderName: "" };
}

export function hasCheckDetails(check: PaymentCheckDetailsPayload | undefined): boolean {
  if (!check) return false;
  return Boolean(
    check.checkNumber.trim() ||
      check.bankName.trim() ||
      check.branch.trim() ||
      check.dueDate.trim() ||
      check.holderName.trim(),
  );
}

export type IncomeExpensePayload = {
  kind: "income" | "expense";
  clientMode: ClientMode;
  /** סוג הוצאה — רק kind === "expense" */
  expenseType?: ExpenseType;
  counterpartyName: string;
  docDate: string;
  documentType: string;
  paymentMethod: string;
  /** סכום ששולם במסגרת מסמך זה (שדה ישן לתאימות) */
  paymentPaidAmount: string;
  /** אמצעי תשלום בפועל — מזומן / אשראי / העברה בנקאית / ביט / צ׳ק */
  paymentInstrument: string;
  /** הערות תשלום */
  paymentNotes: string;
  /** תשלומים מרובים בפועל — מחליף את שדות התשלום הישנים, שנשארים לתאימות. */
  payments: PaymentLinePayload[];
  /** alias שמור ב־metadata עבור מסמכים כספיים חדשים. */
  paymentMethods?: PaymentLinePayload[];
  includeDeposit: boolean;
  depositAmount: string;
  depositType: string;
  depositNote: string;
  depositStatus: "open" | "returned" | "refunded";
  trayQty: string;
  returnDate: string;
  lines: FinanceLineItemPayload[];
  /** מזהה ספק ממחירון — רק הוצאות; מסנכרן עם שם הספק בכותרת המסמך */
  supplierId?: string | null;
  /** מזהה עובד — תשלום לעובדים */
  employeeId?: string | null;
  /** שכר | מפרעה | מתנה | אחר */
  employeePayType?: EmployeePayType;
  /** סכום תשלום עובד — ללא טבלת פריטים */
  employeePayAmount?: string;
  /** הערות למסמך תשלום עובד */
  employeePayNotes?: string;
  /** When the form was filled via the OCR scanner: link to the uploaded file. */
  receiptFileUrl?: string | null;
  receiptFileName?: string | null;
};

export type ZReportPayload = {
  kind: "zreport";
  zDate: string;
  zNumber: string;
  cashTaxable: number;
  cashExempt: number;
  creditTaxable: number;
  creditExempt: number;
  transfers: number;
};

export type FinanceDocumentPayload = IncomeExpensePayload | ZReportPayload;

export function newLineId(): string {
  return `line-${Math.random().toString(36).slice(2, 10)}`;
}

export function newPaymentId(): string {
  return `pay-${Math.random().toString(36).slice(2, 10)}`;
}

export function emptyIncomeExpensePayload(kind: "income" | "expense"): IncomeExpensePayload {
  return {
    kind,
    clientMode: "general",
    ...(kind === "expense" ? { expenseType: DEFAULT_EXPENSE_TYPE } : {}),
    counterpartyName: "",
    docDate: "",
    documentType: DOCUMENT_TYPE_OPTIONS[0],
    paymentMethod: "",
    paymentPaidAmount: "",
    paymentInstrument: PAYMENT_INSTRUMENT_OPTIONS[0],
    paymentNotes: "",
    payments: [
      {
        id: newPaymentId(),
        instrument: PAYMENT_INSTRUMENT_OPTIONS[0],
        amount: "",
        notes: "",
      },
    ],
    paymentMethods: [],
    includeDeposit: false,
    depositAmount: "",
    depositType: DEPOSIT_TYPE_OPTIONS[0],
    depositNote: "",
    depositStatus: "open",
    trayQty: "",
    returnDate: "",
    supplierId: null,
    employeeId: null,
    employeePayType: "salary",
    employeePayAmount: "",
    employeePayNotes: "",
    lines: [{ id: newLineId(), itemName: "", quantity: "1", price: "", vatMode: "includes_vat", lineNote: "" }],
  };
}

export function isWorkerExpensePayload(payload: IncomeExpensePayload): boolean {
  return payload.kind === "expense" && normalizeExpenseType(payload.expenseType) === "WORKER_PAYMENTS";
}

function parseAmountStr(s: string | undefined): number {
  return Math.max(0, Number.parseFloat((s ?? "").replace(/,/g, "")) || 0);
}

export function workerPayAmountNum(payload: IncomeExpensePayload): number {
  const direct = parseAmountStr(payload.employeePayAmount);
  if (direct > 0) return direct;
  if (!isWorkerExpensePayload(payload)) return 0;
  return payload.lines.reduce(
    (sum, row) => sum + lineGrossTotal(row.quantity, row.price, row.vatMode),
    0,
  );
}

/** שורה יחידה לשמירה במסמך / API */
export function workerExpenseLines(payload: IncomeExpensePayload): FinanceLineItemPayload[] {
  const amountStr =
    payload.employeePayAmount?.trim() ||
    (workerPayAmountNum(payload) > 0 ? String(workerPayAmountNum(payload)) : "");
  const label = documentTypeForEmployeePay(payload.employeePayType);
  return [
    {
      id: payload.lines[0]?.id ?? newLineId(),
      itemName: label,
      quantity: "1",
      price: amountStr,
      vatMode: "exempt",
      lineNote: payload.employeePayNotes?.trim() ?? "",
      supplierProductId: null,
    },
  ];
}

export function normalizeWorkerExpensePayload(payload: IncomeExpensePayload): IncomeExpensePayload {
  if (!isWorkerExpensePayload(payload)) return payload;
  const lines = workerExpenseLines(payload);
  const amount = payload.employeePayAmount?.trim() || lines[0]?.price || "";
  const payments = payload.payments.map((p, i) =>
    i === 0 && !p.amount.trim() && amount ? { ...p, amount } : p,
  );
  return {
    ...payload,
    employeePayAmount: amount,
    employeePayNotes: payload.employeePayNotes ?? "",
    lines,
    payments,
  };
}

export function buildItemsFromIncomeExpense(payload: IncomeExpensePayload) {
  if (isWorkerExpensePayload(payload)) {
    const amount = workerPayAmountNum(payload);
    if (amount < 1e-6) return [];
    const label = documentTypeForEmployeePay(payload.employeePayType);
    return [
      {
        itemName: label,
        quantity: 1,
        unitPrice: amount,
        vatType: "exempt" as VatMode,
        total: amount,
        lineNote: payload.employeePayNotes?.trim() || null,
      },
    ];
  }
  return payload.lines
    .filter((l) => l.itemName.trim() || parseAmountStr(l.price) > 0)
    .map((l) => {
      const qty = Math.max(0, parseAmountStr(l.quantity));
      const price = Math.max(0, parseAmountStr(l.price));
      const vat = l.vatMode as VatMode;
      const lineTotal = lineGrossTotal(l.quantity, l.price, vat);
      return {
        itemName: l.itemName || "שורה",
        quantity: qty || 1,
        unitPrice: price,
        vatType: l.vatMode,
        total: lineTotal,
        lineNote: l.lineNote?.trim() || null,
      };
    });
}

export function emptyZReportPayload(): ZReportPayload {
  return {
    kind: "zreport",
    zDate: "",
    zNumber: "",
    cashTaxable: 0,
    cashExempt: 0,
    creditTaxable: 0,
    creditExempt: 0,
    transfers: 0,
  };
}

export function parsePayload(raw: unknown): FinanceDocumentPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.kind === "zreport") {
    return {
      kind: "zreport",
      zDate: String(o.zDate ?? ""),
      zNumber: String(o.zNumber ?? ""),
      cashTaxable: Number(o.cashTaxable) || 0,
      cashExempt: Number(o.cashExempt) || 0,
      creditTaxable: Number(o.creditTaxable) || 0,
      creditExempt: Number(o.creditExempt) || 0,
      transfers: Number(o.transfers) || 0,
    };
  }
  if (o.kind === "income" || o.kind === "expense") {
    const linesRaw = Array.isArray(o.lines) ? o.lines : [];
    const lines: FinanceLineItemPayload[] = linesRaw.map((row) => {
      const r = row as Record<string, unknown>;
      const vm = r.vatMode;
      const vatMode: VatMode =
        vm === "before_vat" || vm === "exempt" ? vm : "includes_vat";
      const pfRaw = r.priceFlag as Record<string, unknown> | undefined;
      const priceFlag =
        pfRaw &&
        (pfRaw.flag === "higher" || pfRaw.flag === "lower" || pfRaw.flag === "match")
          ? {
              regularPrice:
                typeof pfRaw.regularPrice === "number" ? pfRaw.regularPrice : null,
              samples: typeof pfRaw.samples === "number" ? pfRaw.samples : 0,
              flag: pfRaw.flag as "higher" | "lower" | "match",
            }
          : null;
      return {
        id: typeof r.id === "string" ? r.id : newLineId(),
        itemName: String(r.itemName ?? ""),
        quantity: String(r.quantity ?? "1"),
        price: String(r.price ?? ""),
        vatMode,
        supplierProductId: typeof r.supplierProductId === "string" ? r.supplierProductId : null,
        lineNote: typeof r.lineNote === "string" ? r.lineNote : "",
        ...(priceFlag ? { priceFlag } : {}),
      };
    });
    const docTypeRaw = String(o.documentType ?? "").trim();
    const paymentsRaw = Array.isArray(o.payments)
      ? o.payments
      : Array.isArray(o.paymentMethods)
        ? o.paymentMethods
        : [];
    const payments: PaymentLinePayload[] = paymentsRaw.map((row) => {
      const r = row as Record<string, unknown>;
      const instrument = String(r.instrument ?? PAYMENT_INSTRUMENT_OPTIONS[0]).trim();
      const checkRaw = r.check as Record<string, unknown> | undefined;
      const check: PaymentCheckDetailsPayload | undefined = checkRaw
        ? {
            checkNumber: String(checkRaw.checkNumber ?? ""),
            bankName: String(checkRaw.bankName ?? ""),
            branch: String(checkRaw.branch ?? ""),
            dueDate: String(checkRaw.dueDate ?? ""),
            holderName: String(checkRaw.holderName ?? ""),
          }
        : undefined;
      return {
        id: typeof r.id === "string" ? r.id : newPaymentId(),
        instrument: instrument || PAYMENT_INSTRUMENT_OPTIONS[0],
        amount: String(r.amount ?? ""),
        notes: String(r.notes ?? ""),
        ...(check ? { check } : {}),
      };
    });
    if (!payments.length) {
      payments.push({
        id: newPaymentId(),
        instrument: String(o.paymentInstrument ?? PAYMENT_INSTRUMENT_OPTIONS[0]),
        amount: String(o.paymentPaidAmount ?? ""),
        notes: String(o.paymentNotes ?? ""),
      });
    }
    const kind = o.kind === "expense" ? "expense" : "income";
    return {
      kind,
      clientMode: o.clientMode === "event" ? "event" : "general",
      ...(kind === "expense" ? { expenseType: normalizeExpenseType(o.expenseType) } : {}),
      counterpartyName: String(o.counterpartyName ?? ""),
      docDate: String(o.docDate ?? ""),
      documentType: docTypeRaw || DOCUMENT_TYPE_OPTIONS[0],
      paymentMethod: String(o.paymentMethod ?? ""),
      paymentPaidAmount: String(o.paymentPaidAmount ?? ""),
      paymentInstrument: String(o.paymentInstrument ?? PAYMENT_INSTRUMENT_OPTIONS[0]),
      paymentNotes: String(o.paymentNotes ?? ""),
      payments,
      paymentMethods: payments,
      includeDeposit: Boolean(o.includeDeposit) || (Number(o.depositAmount) || 0) > 0,
      depositAmount: String(o.depositAmount ?? ""),
      depositType: String(o.depositType ?? DEPOSIT_TYPE_OPTIONS[0]),
      depositNote: String(o.depositNote ?? ""),
      depositStatus:
        o.depositStatus === "returned" || o.depositStatus === "refunded"
          ? o.depositStatus
          : "open",
      trayQty: String(o.trayQty ?? ""),
      returnDate: String(o.returnDate ?? ""),
      supplierId: typeof o.supplierId === "string" && o.supplierId.trim() ? o.supplierId.trim() : null,
      employeeId: typeof o.employeeId === "string" && o.employeeId.trim() ? o.employeeId.trim() : null,
      ...(kind === "expense"
        ? {
            employeePayType: normalizeEmployeePayType(o.employeePayType),
            employeePayAmount: String(o.employeePayAmount ?? ""),
            employeePayNotes: String(o.employeePayNotes ?? ""),
          }
        : {}),
      lines: lines.length ? lines : emptyIncomeExpensePayload(o.kind).lines,
      receiptFileUrl:
        typeof o.receiptFileUrl === "string" ? o.receiptFileUrl : null,
      receiptFileName:
        typeof o.receiptFileName === "string" ? o.receiptFileName : null,
    };
  }
  return null;
}

/** Gross line total (amount including VAT where applicable). */
export function lineGrossTotal(qtyStr: string, priceStr: string, vatMode: VatMode): number {
  const q = Math.max(0, Number.parseFloat(qtyStr.replace(/,/g, "")) || 0);
  const p = Math.max(0, Number.parseFloat(priceStr.replace(/,/g, "")) || 0);
  const base = q * p;
  if (vatMode === "exempt" || vatMode === "includes_vat") return base;
  return base * (1 + VAT_RATE);
}

export function lineNetTotal(qtyStr: string, priceStr: string, vatMode: VatMode): number {
  const q = Math.max(0, Number.parseFloat(qtyStr.replace(/,/g, "")) || 0);
  const p = Math.max(0, Number.parseFloat(priceStr.replace(/,/g, "")) || 0);
  const base = q * p;
  if (vatMode === "includes_vat") return base / (1 + VAT_RATE);
  return base;
}

export function lineVatTotal(qtyStr: string, priceStr: string, vatMode: VatMode): number {
  if (vatMode === "exempt") return 0;
  return lineGrossTotal(qtyStr, priceStr, vatMode) - lineNetTotal(qtyStr, priceStr, vatMode);
}

export function incomeExpenseGrandTotal(payload: IncomeExpensePayload): number {
  if (isWorkerExpensePayload(payload)) return workerPayAmountNum(payload);
  return payload.lines.reduce((sum, row) => sum + lineGrossTotal(row.quantity, row.price, row.vatMode), 0);
}

export function incomeExpenseDepositAmount(payload: IncomeExpensePayload): number {
  if (!payload.includeDeposit) return 0;
  return Math.max(0, Number.parseFloat(payload.depositAmount.replace(/,/g, "")) || 0);
}

export function incomeExpenseTotalToPay(payload: IncomeExpensePayload): number {
  return incomeExpenseGrandTotal(payload) + incomeExpenseDepositAmount(payload);
}

export function incomeExpenseNetTotal(payload: IncomeExpensePayload): number {
  return payload.lines.reduce((sum, row) => sum + lineNetTotal(row.quantity, row.price, row.vatMode), 0);
}

export function incomeExpenseVatTotal(payload: IncomeExpensePayload): number {
  return payload.lines.reduce((sum, row) => sum + lineVatTotal(row.quantity, row.price, row.vatMode), 0);
}

export function paymentLinesTotal(payload: IncomeExpensePayload): number {
  const rows = payload.payments?.length ? payload.payments : payload.paymentMethods ?? [];
  return rows.reduce((sum, row) => {
    const amount = Math.max(0, Number.parseFloat(row.amount.replace(/,/g, "")) || 0);
    return sum + amount;
  }, 0);
}

  /** שורת notes במסמך — שדות ישנים + הערות תשלום מהכרטיס המשותף */
export function combineIncomeNotes(ie: IncomeExpensePayload): string | null {
  const chunks: string[] = [];
  if (isWorkerExpensePayload(ie)) {
    const note = ie.employeePayNotes?.trim();
    if (note) chunks.push(note);
  }
  if (ie.paymentMethod.trim()) chunks.push(`תקבול: ${ie.paymentMethod.trim()}`);
  if (ie.paymentNotes.trim()) chunks.push(`הערות תשלום: ${ie.paymentNotes.trim()}`);
  const rows = ie.payments?.length ? ie.payments : ie.paymentMethods ?? [];
  for (const p of rows) {
    const amount = p.amount.trim();
    const note = p.notes.trim();
    if (amount || note) {
      chunks.push(`תשלום ${p.instrument}: ${amount || "0"}${note ? ` (${note})` : ""}`);
    }
  }
  return chunks.length ? chunks.join(" | ") : null;
}
