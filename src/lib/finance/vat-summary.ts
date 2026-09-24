import type { VatMode } from "@/lib/finance/document-payload";
import { computeManualReceiptVat, addMoney, subtractMoney } from "@/lib/finance/manual-receipt-vat";
import { vatRateOn, type VatRateRule } from "@/lib/finance/vat-rate";

export type VatSourceType = "z_report" | "income_document" | "manual_receipt" | "expense_invoice";

export type VatSourceLine = {
  sourceType: VatSourceType;
  sourceId: string;
  date: string;
  label: string;
  documentNumber: string;
  partyName: string;
  documentType: string;
  /** Gross amount that entered the output VAT base, or net amount for an input receipt. */
  taxableAmount: string;
  netAmount: string;
  vatAmount: string;
  documentVat: string;
  grossAmount: string;
  vatRate: string;
  cashTaxable: string;
  creditTaxable: string;
  cashExempt: string;
  deductible: boolean;
  hasPdf: boolean;
  canDuplicate: boolean;
  attachmentPath: string | null;
  attachmentBucket: string | null;
  attachmentName: string | null;
  attachmentMime: string | null;
};

export type VatSummary = {
  outputVat: string;
  inputVat: string;
  payableVat: string;
  payableSide: "payable" | "credit" | "zero";
  taxableRevenue: string;
  deductibleExpenses: string;
  outputBySource: { zReports: VatBucket; incomeDocuments: VatBucket };
  inputBySource: { manualReceipts: VatBucket; expenseInvoices: VatBucket };
  sources: VatSourceLine[];
};

export type VatBucket = { taxableAmount: string; vatAmount: string; count: number };

type ZInput = {
  id: string;
  date: string;
  label?: string;
  documentNumber?: string;
  cashTaxable: number;
  cashExempt: number;
  creditTaxable: number;
  hasPdf?: boolean;
  attachmentPath?: string | null;
  attachmentBucket?: string | null;
  attachmentName?: string | null;
  attachmentMime?: string | null;
};

type IncomeInput = {
  id: string;
  date: string;
  label?: string;
  documentNumber?: string;
  partyName?: string;
  documentType?: string;
  hasPdf?: boolean;
  attachmentPath?: string | null;
  attachmentBucket?: string | null;
  attachmentName?: string | null;
  attachmentMime?: string | null;
  lines: Array<{ quantity: string; price: string; vatMode: VatMode }>;
};

type ReceiptInput = {
  id: string;
  date: string;
  label?: string;
  documentNumber?: string;
  partyName?: string;
  documentType?: string;
  amountBeforeVat: string;
  vatDeductibleAmount: string;
  documentVat?: string;
  grossAmount?: string;
  deductible?: boolean;
  hasPdf?: boolean;
  attachmentPath?: string | null;
  attachmentBucket?: string | null;
  attachmentName?: string | null;
  attachmentMime?: string | null;
};

function inPeriod(date: string, from: string, to: string): boolean {
  const day = date.slice(0, 10);
  return day >= from && day <= to;
}

function moneyOf(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) return "0.00";
  return amount.toFixed(2);
}

function moneyExact(amount: number): string {
  if (!Number.isFinite(amount)) return "0.00";
  return (Math.round(amount * 100) / 100).toFixed(2);
}

function emptyLine(partial: Omit<VatSourceLine, "cashTaxable" | "creditTaxable" | "cashExempt" | "attachmentPath" | "attachmentBucket" | "attachmentName" | "attachmentMime"> & Partial<VatSourceLine>): VatSourceLine {
  return {
    cashTaxable: "0.00",
    creditTaxable: "0.00",
    cashExempt: "0.00",
    attachmentPath: null,
    attachmentBucket: null,
    attachmentName: null,
    attachmentMime: null,
    ...partial,
  };
}

function lineBase(quantity: string, price: string): string {
  const q = Math.max(0, Number.parseFloat(quantity.replace(/,/g, "")) || 0);
  const p = Math.max(0, Number.parseFloat(price.replace(/,/g, "")) || 0);
  const agorot = Math.round(q * p * 100);
  if (!Number.isSafeInteger(agorot)) return "0.00";
  return `${Math.floor(agorot / 100)}.${String(agorot % 100).padStart(2, "0")}`;
}

function emptyBucket(): VatBucket {
  return { taxableAmount: "0.00", vatAmount: "0.00", count: 0 };
}

function addBucket(bucket: VatBucket, taxable: string, vat: string): VatBucket {
  return {
    taxableAmount: addMoney(bucket.taxableAmount, taxable),
    vatAmount: addMoney(bucket.vatAmount, vat),
    count: bucket.count + 1,
  };
}

export function getVatSummary(input: {
  from: string;
  to: string;
  zReports: ZInput[];
  incomeDocuments: IncomeInput[];
  manualReceipts: ReceiptInput[];
  expenseInvoices?: ReceiptInput[];
  schedule?: VatRateRule[];
}): VatSummary {
  const rateOn = (date: string) => vatRateOn(date, input.schedule);
  const seen = new Set<string>();
  const sources: VatSourceLine[] = [];
  let zBucket = emptyBucket();
  let incomeBucket = emptyBucket();
  let receiptBucket = emptyBucket();
  let expenseBucket = emptyBucket();

  const push = (line: VatSourceLine, bucket: "z" | "income" | "receipt" | "expense") => {
    const key = `${line.sourceType}:${line.sourceId}`;
    if (seen.has(key)) return;
    seen.add(key);
    sources.push(line);
    if (bucket === "z") zBucket = addBucket(zBucket, line.taxableAmount, line.vatAmount);
    else if (bucket === "income") incomeBucket = addBucket(incomeBucket, line.taxableAmount, line.vatAmount);
    else if (bucket === "receipt") receiptBucket = addBucket(receiptBucket, line.taxableAmount, line.vatAmount);
    else expenseBucket = addBucket(expenseBucket, line.taxableAmount, line.vatAmount);
  };

  for (const row of input.zReports) {
    if (!inPeriod(row.date, input.from, input.to)) continue;
    const cashTaxable = Math.max(0, row.cashTaxable);
    const creditTaxable = Math.max(0, row.creditTaxable);
    const cashExempt = Math.max(0, row.cashExempt);
    const gross = cashTaxable + creditTaxable;
    const split = computeManualReceiptVat({
      enteredAmount: moneyOf(gross),
      mode: "includes_vat",
      vatDeductible: false,
      rate: rateOn(row.date),
    });
    if (!split) continue;
    push(
      emptyLine({
        sourceType: "z_report",
        sourceId: row.id,
        date: row.date.slice(0, 10),
        label: row.label || row.documentNumber || row.id,
        documentNumber: row.documentNumber || row.label || row.id,
        partyName: "",
        documentType: "דוח Z",
        taxableAmount: split.totalAmount,
        netAmount: split.amountBeforeVat,
        vatAmount: split.vatAmount,
        documentVat: split.vatAmount,
        grossAmount: split.totalAmount,
        vatRate: split.vatRate,
        cashTaxable: moneyExact(cashTaxable),
        creditTaxable: moneyExact(creditTaxable),
        cashExempt: moneyExact(cashExempt),
        deductible: false,
        hasPdf: row.hasPdf === true,
        canDuplicate: false,
        attachmentPath: row.attachmentPath ?? null,
        attachmentBucket: row.attachmentBucket ?? null,
        attachmentName: row.attachmentName ?? null,
        attachmentMime: row.attachmentMime ?? null,
      }),
      "z",
    );
  }

  for (const doc of input.incomeDocuments) {
    if (!inPeriod(doc.date, input.from, input.to)) continue;
    let taxable = "0.00";
    let net = "0.00";
    let vat = "0.00";
    let rate = String(rateOn(doc.date));
    for (const line of doc.lines) {
      if (line.vatMode === "exempt") continue;
      const base = lineBase(line.quantity, line.price);
      const split = computeManualReceiptVat({
        enteredAmount: base,
        mode: line.vatMode === "before_vat" ? "before_vat" : "includes_vat",
        vatDeductible: false,
        rate: rateOn(doc.date),
      });
      if (!split) continue;
      taxable = addMoney(taxable, split.totalAmount);
      net = addMoney(net, split.amountBeforeVat);
      vat = addMoney(vat, split.vatAmount);
      rate = split.vatRate;
    }
    if (taxable === "0.00" && vat === "0.00") continue;
    push(
      emptyLine({
        sourceType: "income_document",
        sourceId: doc.id,
        date: doc.date.slice(0, 10),
        label: doc.label || doc.documentNumber || doc.id,
        documentNumber: doc.documentNumber || doc.label || doc.id,
        partyName: doc.partyName || "",
        documentType: doc.documentType || "",
        taxableAmount: taxable,
        netAmount: net,
        vatAmount: vat,
        documentVat: vat,
        grossAmount: taxable,
        vatRate: rate,
        deductible: false,
        hasPdf: doc.hasPdf === true,
        canDuplicate: true,
        attachmentPath: doc.attachmentPath ?? null,
        attachmentBucket: doc.attachmentBucket ?? null,
        attachmentName: doc.attachmentName ?? null,
        attachmentMime: doc.attachmentMime ?? null,
      }),
      "income",
    );
  }

  for (const row of input.manualReceipts) {
    if (!inPeriod(row.date, input.from, input.to)) continue;
    const deductible = row.deductible ?? Number(row.vatDeductibleAmount) > 0;
    push(
      emptyLine({
        sourceType: "manual_receipt",
        sourceId: row.id,
        date: row.date.slice(0, 10),
        label: row.label || row.partyName || row.id,
        documentNumber: row.documentNumber || row.label || row.id,
        partyName: row.partyName || row.label || "",
        documentType: row.documentType || "",
        taxableAmount: row.amountBeforeVat,
        netAmount: row.amountBeforeVat,
        vatAmount: row.vatDeductibleAmount,
        documentVat: row.documentVat ?? row.vatDeductibleAmount,
        grossAmount: row.grossAmount ?? row.amountBeforeVat,
        vatRate: String(rateOn(row.date)),
        deductible,
        hasPdf: row.hasPdf === true,
        canDuplicate: false,
        attachmentPath: row.attachmentPath ?? null,
        attachmentBucket: row.attachmentBucket ?? null,
        attachmentName: row.attachmentName ?? null,
        attachmentMime: row.attachmentMime ?? null,
      }),
      "receipt",
    );
  }

  for (const row of input.expenseInvoices ?? []) {
    if (!inPeriod(row.date, input.from, input.to)) continue;
    const deductible = row.deductible ?? Number(row.vatDeductibleAmount) > 0;
    push(
      emptyLine({
        sourceType: "expense_invoice",
        sourceId: row.id,
        date: row.date.slice(0, 10),
        label: row.label || row.partyName || row.id,
        documentNumber: row.documentNumber || row.label || row.id,
        partyName: row.partyName || row.label || "",
        documentType: row.documentType || "",
        taxableAmount: row.amountBeforeVat,
        netAmount: row.amountBeforeVat,
        vatAmount: row.vatDeductibleAmount,
        documentVat: row.documentVat ?? row.vatDeductibleAmount,
        grossAmount: row.grossAmount ?? row.amountBeforeVat,
        vatRate: String(rateOn(row.date)),
        deductible,
        hasPdf: row.hasPdf === true,
        canDuplicate: false,
        attachmentPath: row.attachmentPath ?? null,
        attachmentBucket: row.attachmentBucket ?? null,
        attachmentName: row.attachmentName ?? null,
        attachmentMime: row.attachmentMime ?? null,
      }),
      "expense",
    );
  }

  const outputVat = addMoney(zBucket.vatAmount, incomeBucket.vatAmount);
  const inputVat = addMoney(receiptBucket.vatAmount, expenseBucket.vatAmount);
  const raw = subtractMoney(outputVat, inputVat);
  const negative = raw.startsWith("-");
  const payableVat = negative ? raw.slice(1) : raw;
  const payableSide = raw === "0.00" ? "zero" : negative ? "credit" : "payable";

  return {
    outputVat,
    inputVat,
    payableVat,
    payableSide,
    taxableRevenue: addMoney(zBucket.taxableAmount, incomeBucket.taxableAmount),
    deductibleExpenses: addMoney(receiptBucket.taxableAmount, expenseBucket.taxableAmount),
    outputBySource: { zReports: zBucket, incomeDocuments: incomeBucket },
    inputBySource: { manualReceipts: receiptBucket, expenseInvoices: expenseBucket },
    sources,
  };
}

export function vatSummaryReconciles(summary: VatSummary): { ok: boolean } {
  const sumVat = (rows: VatSourceLine[]) => rows.reduce((total, row) => addMoney(total, row.vatAmount), "0.00");
  const sumTaxable = (rows: VatSourceLine[]) => rows.reduce((total, row) => addMoney(total, row.taxableAmount), "0.00");
  const outputRows = summary.sources.filter((row) => row.sourceType === "z_report" || row.sourceType === "income_document");
  const inputRows = summary.sources.filter((row) => row.sourceType === "manual_receipt" || row.sourceType === "expense_invoice");
  const zRows = summary.sources.filter((row) => row.sourceType === "z_report");
  const incomeRows = summary.sources.filter((row) => row.sourceType === "income_document");
  const outputVat = sumVat(outputRows);
  const inputVat = sumVat(inputRows);
  const raw = subtractMoney(outputVat, inputVat);
  const payableVat = raw.startsWith("-") ? raw.slice(1) : raw;
  const payableSide = raw === "0.00" ? "zero" : raw.startsWith("-") ? "credit" : "payable";
  const keys = summary.sources.map((row) => `${row.sourceType}:${row.sourceId}`);
  const unique = new Set(keys).size === keys.length;
  const ok =
    unique &&
    outputVat === summary.outputVat &&
    inputVat === summary.inputVat &&
    payableVat === summary.payableVat &&
    payableSide === summary.payableSide &&
    sumVat(zRows) === summary.outputBySource.zReports.vatAmount &&
    sumTaxable(zRows) === summary.outputBySource.zReports.taxableAmount &&
    zRows.length === summary.outputBySource.zReports.count &&
    sumVat(incomeRows) === summary.outputBySource.incomeDocuments.vatAmount &&
    sumTaxable(incomeRows) === summary.outputBySource.incomeDocuments.taxableAmount &&
    incomeRows.length === summary.outputBySource.incomeDocuments.count;
  return { ok };
}

export function periodBounds(
  kind: "week" | "month" | "year",
  anchorIso: string,
): { from: string; to: string } {
  const [y, m, d] = anchorIso.slice(0, 10).split("-").map(Number);
  const anchor = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  if (kind === "year") {
    return { from: `${y}-01-01`, to: `${y}-12-31` };
  }
  if (kind === "month") {
    const last = new Date(Date.UTC(y, m || 1, 0)).getUTCDate();
    const month = String(m).padStart(2, "0");
    return { from: `${y}-${month}-01`, to: `${y}-${month}-${String(last).padStart(2, "0")}` };
  }
  const weekday = anchor.getUTCDay();
  const start = new Date(anchor);
  start.setUTCDate(anchor.getUTCDate() - weekday);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  const fmt = (dt: Date) => dt.toISOString().slice(0, 10);
  return { from: fmt(start), to: fmt(end) };
}

export function shiftAnchor(kind: "week" | "month" | "year", anchorIso: string, delta: number): string {
  const [y, m, d] = anchorIso.slice(0, 10).split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  if (kind === "week") dt.setUTCDate(dt.getUTCDate() + delta * 7);
  else if (kind === "month") dt.setUTCMonth(dt.getUTCMonth() + delta);
  else dt.setUTCFullYear(dt.getUTCFullYear() + delta);
  return dt.toISOString().slice(0, 10);
}
