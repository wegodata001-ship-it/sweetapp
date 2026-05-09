/** Israeli VAT rate for line calculations (decimal). */
export const VAT_RATE = 0.17;

/** Exact document type labels for commercial documents (Hebrew). */
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
  includes_vat: "Price includes VAT",
  before_vat: "Price before VAT",
  exempt: "VAT Exempt",
};

export type FinanceLineItemPayload = {
  id: string;
  itemName: string;
  quantity: string;
  price: string;
  vatMode: VatMode;
};

export type IncomeExpensePayload = {
  kind: "income" | "expense";
  clientMode: ClientMode;
  counterpartyName: string;
  docDate: string;
  documentType: string;
  paymentMethod: string;
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

export function emptyIncomeExpensePayload(kind: "income" | "expense"): IncomeExpensePayload {
  return {
    kind,
    clientMode: "general",
    counterpartyName: "",
    docDate: "",
    documentType: DOCUMENT_TYPE_OPTIONS[0],
    paymentMethod: "",
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
    return {
      kind: o.kind,
      clientMode: o.clientMode === "event" ? "event" : "general",
      counterpartyName: String(o.counterpartyName ?? ""),
      docDate: String(o.docDate ?? ""),
      documentType: docTypeRaw || DOCUMENT_TYPE_OPTIONS[0],
      paymentMethod: String(o.paymentMethod ?? ""),
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

export function incomeExpenseGrandTotal(payload: IncomeExpensePayload): number {
  return payload.lines.reduce((sum, row) => sum + lineGrossTotal(row.quantity, row.price, row.vatMode), 0);
}
