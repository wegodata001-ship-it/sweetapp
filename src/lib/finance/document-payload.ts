/** Israeli VAT rate for line calculations (decimal). */
export const VAT_RATE = 0.18;

/** Exact document type labels for commercial documents (Hebrew). */
/** אמצעי תשלום בכרטיס "פרטי תשלום" (מסמכי הכנסה) */
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
};

export type PaymentLinePayload = {
  id: string;
  instrument: string;
  amount: string;
  notes: string;
};

export type IncomeExpensePayload = {
  kind: "income" | "expense";
  clientMode: ClientMode;
  counterpartyName: string;
  docDate: string;
  documentType: string;
  paymentMethod: string;
  /** סכום ששולם במסגרת מסמך זה (הכנסות) */
  paymentPaidAmount: string;
  /** אמצעי תשלום בפועל — מזומן / אשראי / העברה בנקאית / ביט / צ׳ק */
  paymentInstrument: string;
  /** הערות תשלום */
  paymentNotes: string;
  /** תשלומים מרובים בפועל — מחליף את שדות התשלום הישנים, שנשארים לתאימות. */
  payments: PaymentLinePayload[];
  depositAmount: string;
  trayQty: string;
  returnDate: string;
  lines: FinanceLineItemPayload[];
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
    depositAmount: "",
    trayQty: "",
    returnDate: "",
    lines: [{ id: newLineId(), itemName: "", quantity: "1", price: "", vatMode: "includes_vat" }],
  };
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
      return {
        id: typeof r.id === "string" ? r.id : newLineId(),
        itemName: String(r.itemName ?? ""),
        quantity: String(r.quantity ?? "1"),
        price: String(r.price ?? ""),
        vatMode,
      };
    });
    const docTypeRaw = String(o.documentType ?? "").trim();
    const paymentsRaw = Array.isArray(o.payments) ? o.payments : [];
    const payments: PaymentLinePayload[] = paymentsRaw.map((row) => {
      const r = row as Record<string, unknown>;
      const instrument = String(r.instrument ?? PAYMENT_INSTRUMENT_OPTIONS[0]).trim();
      return {
        id: typeof r.id === "string" ? r.id : newPaymentId(),
        instrument: instrument || PAYMENT_INSTRUMENT_OPTIONS[0],
        amount: String(r.amount ?? ""),
        notes: String(r.notes ?? ""),
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
    return {
      kind: o.kind,
      clientMode: o.clientMode === "event" ? "event" : "general",
      counterpartyName: String(o.counterpartyName ?? ""),
      docDate: String(o.docDate ?? ""),
      documentType: docTypeRaw || DOCUMENT_TYPE_OPTIONS[0],
      paymentMethod: String(o.paymentMethod ?? ""),
      paymentPaidAmount: String(o.paymentPaidAmount ?? ""),
      paymentInstrument: String(o.paymentInstrument ?? PAYMENT_INSTRUMENT_OPTIONS[0]),
      paymentNotes: String(o.paymentNotes ?? ""),
      payments,
      depositAmount: String(o.depositAmount ?? ""),
      trayQty: String(o.trayQty ?? ""),
      returnDate: String(o.returnDate ?? ""),
      lines: lines.length ? lines : emptyIncomeExpensePayload(o.kind).lines,
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
  return payload.lines.reduce((sum, row) => sum + lineGrossTotal(row.quantity, row.price, row.vatMode), 0);
}

export function incomeExpenseNetTotal(payload: IncomeExpensePayload): number {
  return payload.lines.reduce((sum, row) => sum + lineNetTotal(row.quantity, row.price, row.vatMode), 0);
}

export function incomeExpenseVatTotal(payload: IncomeExpensePayload): number {
  return payload.lines.reduce((sum, row) => sum + lineVatTotal(row.quantity, row.price, row.vatMode), 0);
}

export function paymentLinesTotal(payload: IncomeExpensePayload): number {
  return payload.payments.reduce((sum, row) => {
    const amount = Math.max(0, Number.parseFloat(row.amount.replace(/,/g, "")) || 0);
    return sum + amount;
  }, 0);
}

/** שורת notes במסמך — תקבול קיים + הערות תשלום מהכרטיס החדש */
export function combineIncomeNotes(ie: IncomeExpensePayload): string | null {
  const chunks: string[] = [];
  if (ie.paymentMethod.trim()) chunks.push(`תקבול: ${ie.paymentMethod.trim()}`);
  if (ie.paymentNotes.trim()) chunks.push(`הערות תשלום: ${ie.paymentNotes.trim()}`);
  for (const p of ie.payments) {
    const amount = p.amount.trim();
    const note = p.notes.trim();
    if (amount || note) {
      chunks.push(`תשלום ${p.instrument}: ${amount || "0"}${note ? ` (${note})` : ""}`);
    }
  }
  return chunks.length ? chunks.join(" | ") : null;
}
