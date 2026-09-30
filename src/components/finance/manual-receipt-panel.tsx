"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { EXPENSE_TYPE_I18N, EXPENSE_TYPE_VALUES } from "@/lib/finance/expense-types";
import { PAYMENT_INSTRUMENT_OPTIONS, PAYMENT_METHOD_LABELS } from "@/lib/finance/document-payload";
import {
  MANUAL_DOCUMENT_TYPES,
  type ManualVatMode,
} from "@/lib/finance/manual-receipt-vat";
import { normalizeSupplierName } from "@/lib/document-scan/supplier-aliases";
import {
  manualReceiptLineAmount,
  parseManualReceiptLines,
  quoteManualReceipt,
  type ManualReceiptLine,
} from "@/lib/finance/manual-receipt-lines";

type ReceiptRow = {
  id: string;
  documentDate: string;
  documentNumber: string | null;
  supplierName: string;
  supplierTaxId: string | null;
  supplierPhone?: string | null;
  supplierAddress?: string | null;
  documentType: string;
  category: string | null;
  description: string | null;
  lines?: ManualReceiptLine[];
  amountBeforeVat: string;
  vatAmount: string;
  totalAmount: string;
  vatMode: ManualVatMode;
  vatDeductible: boolean;
  paymentMethod: string | null;
  attachmentPath: string | null;
  attachmentBucket: string | null;
  attachmentMime: string | null;
  attachmentName: string | null;
  linkedFinancialDocumentId: string | null;
};

type ExpenseOption = { id: string; title: string; docDate: string | null; totalAmount: string };
type SupplierOption = { id: string; name: string; phone: string | null };

type ListResponse = {
  ok: boolean;
  error?: string;
  data: ReceiptRow[];
  summary: { count: number; beforeVat: string; vat: string; total: string; deductibleVat: string };
  vatReport: { outputVat: string; inputVat: string; vatPayable: string };
  linkableExpenses: ExpenseOption[];
};

type DraftLine = { key: string; description: string; quantity: string; unitPrice: string };

function draftLine(partial?: Partial<DraftLine>): DraftLine {
  return {
    key: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now() + Math.random()),
    description: partial?.description ?? "",
    quantity: partial?.quantity ?? "",
    unitPrice: partial?.unitPrice ?? "",
  };
}

const emptyForm = {
  documentDate: "",
  documentNumber: "",
  supplierName: "",
  supplierTaxId: "",
  supplierPhone: "",
  supplierAddress: "",
  documentType: MANUAL_DOCUMENT_TYPES[0] as string,
  category: "",
  description: "",
  vatMode: "includes_vat" as ManualVatMode,
  vatDeductible: true,
  paymentMethod: "",
  attachmentPath: "",
  attachmentBucket: "",
  attachmentMime: "",
  attachmentName: "",
  linkedFinancialDocumentId: "",
};

export function ManualReceiptPanel({ focusId }: { focusId?: string | null }) {
  const { t } = useI18n();
  const [form, setForm] = useState(emptyForm);
  const [lines, setLines] = useState<DraftLine[]>([draftLine()]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [rows, setRows] = useState<ReceiptRow[]>([]);
  const [expenses, setExpenses] = useState<ExpenseOption[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [summary, setSummary] = useState<ListResponse["summary"] | null>(null);
  const [vatReport, setVatReport] = useState<ListResponse["vatReport"] | null>(null);
  const [filters, setFilters] = useState({ from: "", to: "", supplier: "", category: "", documentType: "", vatDeductible: "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const focusedReceipt = useRef<string | null>(null);

  const preview = useMemo(() => {
    const parsed = parseManualReceiptLines(lines);
    if ("error" in parsed) return null;
    return quoteManualReceipt({
      lines: parsed.lines,
      mode: form.vatMode,
      vatDeductible: form.vatDeductible,
    });
  }, [lines, form.vatMode, form.vatDeductible]);

  const load = useCallback(async () => {
    const q = new URLSearchParams();
    if (filters.from) q.set("from", filters.from);
    if (filters.to) q.set("to", filters.to);
    if (filters.supplier) q.set("supplier", filters.supplier);
    if (filters.category) q.set("category", filters.category);
    if (filters.documentType) q.set("documentType", filters.documentType);
    if (filters.vatDeductible) q.set("vatDeductible", filters.vatDeductible);
    const res = await fetch(`/api/finance/manual-receipts?${q.toString()}`);
    const body = (await res.json()) as ListResponse;
    if (!body.ok) {
      setError(body.error || "error");
      return;
    }
    setRows(body.data);
    setSummary(body.summary);
    setVatReport(body.vatReport);
    setExpenses(body.linkableExpenses);
  }, [filters]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadSuppliers();
  }, []);

  function loadSuppliers() {
    void fetch("/api/suppliers")
      .then((res) => res.json())
      .then((body: { ok?: boolean; data?: SupplierOption[] }) => {
        if (body.ok && body.data) setSuppliers(body.data);
      })
      .catch(() => undefined);
  }

  useEffect(() => {
    if (!focusId || focusedReceipt.current === focusId) return;
    const row = rows.find((item) => item.id === focusId);
    if (!row) return;
    focusedReceipt.current = focusId;
    edit(row);
  }, [focusId, rows]);

  function chooseSupplier(name: string) {
    const match = suppliers.find((supplier) => supplier.name === name);
    setForm((prev) => ({
      ...prev,
      supplierName: name,
      supplierPhone: match?.phone || prev.supplierPhone,
    }));
  }

  async function onFile(file: File) {
    const data = new FormData();
    data.set("file", file);
    data.set("category", "expense");
    const res = await fetch("/api/source-documents/upload", { method: "POST", body: data });
    const body = (await res.json()) as {
      ok: boolean;
      error?: string;
      data?: { storagePath: string; storageBucket: string; mimeType: string; fileName: string };
    };
    if (!body.ok || !body.data) {
      setError(body.error || "upload");
      return;
    }
    setForm((prev) => ({
      ...prev,
      attachmentPath: body.data!.storagePath,
      attachmentBucket: body.data!.storageBucket,
      attachmentMime: body.data!.mimeType,
      attachmentName: body.data!.fileName,
    }));
  }

  async function openFile(row: ReceiptRow) {
    if (!row.attachmentPath) return;
    const q = new URLSearchParams({
      storagePath: row.attachmentPath,
      storageBucket: row.attachmentBucket || "",
      fileName: row.attachmentName || "receipt",
      fileType: row.attachmentMime || "",
    });
    const res = await fetch(`/api/source-documents/access?${q.toString()}`);
    const body = (await res.json()) as { ok: boolean; data?: { url: string } };
    if (body.ok && body.data?.url) window.open(body.data.url, "_blank", "noopener,noreferrer");
  }

  async function save() {
    setSaving(true);
    setError("");
    const parsed = parseManualReceiptLines(lines);
    if ("error" in parsed) {
      setSaving(false);
      setError(parsed.error);
      return;
    }
    const payload = {
      ...form,
      description: form.description,
      supplierPhone: form.supplierPhone,
      supplierAddress: form.supplierAddress,
      lines: parsed.lines,
      category: form.category || null,
      paymentMethod: form.paymentMethod || null,
      linkedFinancialDocumentId: form.linkedFinancialDocumentId || null,
      attachmentUrl: null,
    };
    const res = await fetch(editingId ? `/api/finance/manual-receipts/${editingId}` : "/api/finance/manual-receipts", {
      method: editingId ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = (await res.json()) as { ok: boolean; error?: string };
    setSaving(false);
    if (!body.ok) {
      setError(body.error || "save");
      return;
    }
    setForm(emptyForm);
    setLines([draftLine()]);
    setEditingId(null);
    loadSuppliers();
    await load();
  }

  async function remove(id: string) {
    if (!window.confirm(t("register.manualReceipt.delete"))) return;
    const res = await fetch(`/api/finance/manual-receipts/${id}`, { method: "DELETE" });
    const body = (await res.json()) as { ok: boolean; error?: string };
    if (!body.ok) setError(body.error || "delete");
    else await load();
  }

  function edit(row: ReceiptRow) {
    setEditingId(row.id);
    const entered = row.vatMode === "before_vat" ? row.amountBeforeVat : row.totalAmount;
    setForm({
      documentDate: row.documentDate,
      documentNumber: row.documentNumber ?? "",
      supplierName: row.supplierName,
      supplierTaxId: row.supplierTaxId ?? "",
      supplierPhone: row.supplierPhone ?? "",
      supplierAddress: row.supplierAddress ?? "",
      documentType: row.documentType,
      category: row.category ?? "",
      description: row.lines?.length ? row.description ?? "" : "",
      vatMode: row.vatMode,
      vatDeductible: row.vatDeductible,
      paymentMethod: row.paymentMethod ?? "",
      attachmentPath: row.attachmentPath ?? "",
      attachmentBucket: row.attachmentBucket ?? "",
      attachmentMime: row.attachmentMime ?? "",
      attachmentName: row.attachmentName ?? "",
      linkedFinancialDocumentId: row.linkedFinancialDocumentId ?? "",
    });
    setLines(
      row.lines?.length
        ? row.lines.map((line) => draftLine(line))
        : [draftLine({ description: row.description ?? "", quantity: "1", unitPrice: entered })],
    );
  }

  const typedManualSupplier = form.supplierName.trim();
  const exactManualSupplier =
    typedManualSupplier.length > 0 &&
    suppliers.some((supplier) => normalizeSupplierName(supplier.name) === normalizeSupplierName(typedManualSupplier));
  const field = "mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm";
  const card = "space-y-3 rounded-2xl border border-slate-200 p-4";

  return (
    <section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-4">
      <h2 className="text-lg font-black text-slate-950">{t("register.manualReceipt.title")}</h2>
      {error ? <p className="text-sm font-semibold text-red-700">{error}</p> : null}

      <div className={card}>
        <h3 className="font-black">{t("register.manualReceipt.docDetails")}</h3>
        <div className="grid gap-3 md:grid-cols-3">
          <label className="text-sm font-semibold">{t("register.fields.docDate")} *
            <input type="date" required className={field} value={form.documentDate} onChange={(e) => setForm({ ...form, documentDate: e.target.value })} />
          </label>
          <label className="text-sm font-semibold">{t("register.manualReceipt.docNumber")} *
            <input required className={field} value={form.documentNumber} onChange={(e) => setForm({ ...form, documentNumber: e.target.value })} />
          </label>
          <label className="text-sm font-semibold">{t("register.manualReceipt.docType")} *
            <select className={field} value={form.documentType} onChange={(e) => setForm({ ...form, documentType: e.target.value })}>
              {MANUAL_DOCUMENT_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
          </label>
        </div>
      </div>

      <div className={card}>
        <h3 className="font-black">{t("register.manualReceipt.supplierDetails")}</h3>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-sm font-semibold">{t("register.manualReceipt.supplier")} *
            <input className={field} list="manual-receipt-suppliers" value={form.supplierName} placeholder={t("register.manualReceipt.pickSupplier")} onFocus={() => loadSuppliers()} onChange={(e) => chooseSupplier(e.target.value)} />
            <datalist id="manual-receipt-suppliers">
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.name}>
                  {supplier.phone ? `${supplier.name} ${supplier.phone}` : supplier.name}
                </option>
              ))}
            </datalist>
            {typedManualSupplier && !exactManualSupplier ? (
              <span className="mt-1 block text-xs font-bold text-cyan-800">
                {t("register.fields.createSupplierNamed", { name: typedManualSupplier })}
              </span>
            ) : null}
          </label>
          <label className="text-sm font-semibold">{t("register.manualReceipt.taxId")}
            <input className={field} value={form.supplierTaxId} onChange={(e) => setForm({ ...form, supplierTaxId: e.target.value })} />
          </label>
          <label className="text-sm font-semibold">{t("register.manualReceipt.phone")}
            <input className={field} value={form.supplierPhone} onChange={(e) => setForm({ ...form, supplierPhone: e.target.value })} />
          </label>
          <label className="text-sm font-semibold">{t("register.manualReceipt.address")}
            <input className={field} value={form.supplierAddress} onChange={(e) => setForm({ ...form, supplierAddress: e.target.value })} />
          </label>
        </div>
      </div>

      <div className={card}>
        <h3 className="font-black">{t("register.manualReceipt.linesTitle")}</h3>
        <div className="hidden md:block">
          <table className="w-full text-right text-sm">
            <thead>
              <tr className="text-slate-500">
                <th className="px-2 py-1">{t("register.manualReceipt.qty")}</th>
                <th className="px-2 py-1">{t("register.manualReceipt.details")}</th>
                <th className="px-2 py-1">{t("register.manualReceipt.unitPrice")}</th>
                <th className="px-2 py-1">{t("register.manualReceipt.lineAmount")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => {
                const amount = manualReceiptLineAmount(line.quantity, line.unitPrice);
                return (
                  <tr key={line.key}>
                    <td className="p-1"><input className={field} inputMode="decimal" value={line.quantity} onChange={(e) => setLines(lines.map((item) => item.key === line.key ? { ...item, quantity: e.target.value } : item))} /></td>
                    <td className="p-1"><input className={field} value={line.description} onChange={(e) => setLines(lines.map((item) => item.key === line.key ? { ...item, description: e.target.value } : item))} /></td>
                    <td className="p-1"><input className={field} inputMode="decimal" value={line.unitPrice} onChange={(e) => setLines(lines.map((item) => item.key === line.key ? { ...item, unitPrice: e.target.value } : item))} /></td>
                    <td className="p-1 font-black">{amount ? `${amount} ₪` : "—"}</td>
                    <td className="p-1"><button type="button" className="text-xs font-bold text-red-700" onClick={() => setLines(lines.length === 1 ? [draftLine()] : lines.filter((item) => item.key !== line.key))}>{t("register.manualReceipt.removeLine")}</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="space-y-3 md:hidden">
          {lines.map((line) => {
            const amount = manualReceiptLineAmount(line.quantity, line.unitPrice);
            return (
              <article key={line.key} className="space-y-2 rounded-xl border border-slate-100 p-3">
                <label className="block text-sm font-semibold">{t("register.manualReceipt.details")}
                  <input className={field} value={line.description} onChange={(e) => setLines(lines.map((item) => item.key === line.key ? { ...item, description: e.target.value } : item))} />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-sm font-semibold">{t("register.manualReceipt.qty")}
                    <input className={field} inputMode="decimal" value={line.quantity} onChange={(e) => setLines(lines.map((item) => item.key === line.key ? { ...item, quantity: e.target.value } : item))} />
                  </label>
                  <label className="text-sm font-semibold">{t("register.manualReceipt.unitPrice")}
                    <input className={field} inputMode="decimal" value={line.unitPrice} onChange={(e) => setLines(lines.map((item) => item.key === line.key ? { ...item, unitPrice: e.target.value } : item))} />
                  </label>
                </div>
                <p className="text-sm font-black">{t("register.manualReceipt.lineAmount")}: {amount ? `${amount} ₪` : "—"}</p>
                <button type="button" className="text-xs font-bold text-red-700" onClick={() => setLines(lines.length === 1 ? [draftLine()] : lines.filter((item) => item.key !== line.key))}>{t("register.manualReceipt.removeLine")}</button>
              </article>
            );
          })}
        </div>
        <button type="button" className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-bold" onClick={() => setLines([...lines, draftLine()])}>+ {t("register.manualReceipt.addLine")}</button>
      </div>

      <div className={card}>
        <h3 className="font-black">{t("register.manualReceipt.summary")}</h3>
        <div className="flex flex-wrap gap-2">
          {(["includes_vat", "before_vat", "no_vat"] as const).map((mode) => (
            <button key={mode} type="button" onClick={() => setForm({ ...form, vatMode: mode })} className={`rounded-full px-3 py-1 text-sm font-bold ${form.vatMode === mode ? "bg-slate-900 text-white" : "bg-slate-100"}`}>
              {t(mode === "includes_vat" ? "register.manualReceipt.includesVat" : mode === "before_vat" ? "register.manualReceipt.beforeVat" : "register.manualReceipt.noVat")}
            </button>
          ))}
        </div>
        <p className="text-sm font-semibold">{t("register.manualReceipt.deductible")}</p>
        <div className="flex gap-2">
          <button type="button" onClick={() => setForm({ ...form, vatDeductible: true })} className={`rounded-full px-3 py-1 text-sm font-bold ${form.vatDeductible ? "bg-slate-900 text-white" : "bg-slate-100"}`}>{t("register.manualReceipt.yes")}</button>
          <button type="button" onClick={() => setForm({ ...form, vatDeductible: false })} className={`rounded-full px-3 py-1 text-sm font-bold ${!form.vatDeductible ? "bg-slate-900 text-white" : "bg-slate-100"}`}>{t("register.manualReceipt.no")}</button>
        </div>
        {preview ? (
          <dl className="grid gap-1 text-sm md:ms-auto md:max-w-xs">
            <div className="flex justify-between"><dt>{t("register.manualReceipt.net")}</dt><dd className="font-black">{preview.amountBeforeVat} ₪</dd></div>
            <div className="flex justify-between"><dt>{t("register.manualReceipt.vat")}</dt><dd className="font-black">{preview.vatAmount} ₪</dd></div>
            <div className="flex justify-between"><dt>{t("register.manualReceipt.totalPay")}</dt><dd className="font-black">{preview.totalAmount} ₪</dd></div>
          </dl>
        ) : null}
      </div>

      <div className={card}>
        <h3 className="font-black">{t("register.manualReceipt.payment")}</h3>
        <select className={field} value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}>
          <option value="">{t("register.manualReceipt.none")}</option>
          {PAYMENT_INSTRUMENT_OPTIONS.map((method) => <option key={method} value={method}>{PAYMENT_METHOD_LABELS[method]}</option>)}
        </select>
      </div>

      <details className={card}>
        <summary className="cursor-pointer font-black">{t("register.manualReceipt.advanced")}</summary>
        <label className="mt-3 block text-sm font-semibold">{t("register.manualReceipt.linkExpense")}
          <select className={field} value={form.linkedFinancialDocumentId} onChange={(e) => setForm({ ...form, linkedFinancialDocumentId: e.target.value })}>
            <option value="">{t("register.manualReceipt.none")}</option>
            {expenses.map((expense) => (
              <option key={expense.id} value={expense.id}>{expense.title} · {expense.totalAmount}</option>
            ))}
          </select>
        </label>
        <label className="mt-3 block text-sm font-semibold">{t("register.manualReceipt.category")}
          <select className={field} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            <option value="">{t("register.manualReceipt.none")}</option>
            {EXPENSE_TYPE_VALUES.map((type) => <option key={type} value={type}>{t(EXPENSE_TYPE_I18N[type])}</option>)}
          </select>
        </label>
      </details>

      <div className={card}>
        <h3 className="font-black">{t("register.manualReceipt.sourceFile")}</h3>
        <p className="text-xs text-slate-500">{t("register.manualReceipt.sourceHint")}</p>
        <div className="flex flex-wrap gap-2">
          <label className="cursor-pointer rounded-xl bg-slate-100 px-3 py-2 text-sm font-bold">
            {t("register.manualReceipt.takePhoto")}
            <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) void onFile(file); }} />
          </label>
          <label className="cursor-pointer rounded-xl bg-slate-100 px-3 py-2 text-sm font-bold">
            {t("register.manualReceipt.uploadImage")}
            <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) void onFile(file); }} />
          </label>
          <label className="cursor-pointer rounded-xl bg-slate-100 px-3 py-2 text-sm font-bold">
            {t("register.manualReceipt.uploadPdf")}
            <input type="file" accept="application/pdf" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) void onFile(file); }} />
          </label>
        </div>
        {form.attachmentName ? <p className="text-xs font-semibold text-slate-700">{form.attachmentName}</p> : null}
      </div>

      <label className="block text-sm font-semibold">{t("register.manualReceipt.note")}
        <textarea className={field} rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      </label>

      <button type="button" disabled={saving} onClick={() => void save()} className="rounded-xl bg-slate-900 px-4 py-3 text-sm font-black text-white">
        {t("register.manualReceipt.saveInvoice")}
      </button>

      <div className="grid gap-2 md:grid-cols-4">
        <label className="text-xs font-semibold">{t("register.manualReceipt.from")}<input type="date" className={field} value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} /></label>
        <label className="text-xs font-semibold">{t("register.manualReceipt.to")}<input type="date" className={field} value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} /></label>
        <label className="text-xs font-semibold">{t("register.manualReceipt.filterSupplier")}<input className={field} value={filters.supplier} onChange={(e) => setFilters({ ...filters, supplier: e.target.value })} /></label>
        <label className="text-xs font-semibold">{t("register.manualReceipt.docType")}
          <select className={field} value={filters.documentType} onChange={(e) => setFilters({ ...filters, documentType: e.target.value })}>
            <option value="">{t("register.manualReceipt.none")}</option>
            {MANUAL_DOCUMENT_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold">{t("register.manualReceipt.category")}
          <select className={field} value={filters.category} onChange={(e) => setFilters({ ...filters, category: e.target.value })}>
            <option value="">{t("register.manualReceipt.none")}</option>
            {EXPENSE_TYPE_VALUES.map((type) => <option key={type} value={type}>{t(EXPENSE_TYPE_I18N[type])}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold">{t("register.manualReceipt.deductible")}
          <select className={field} value={filters.vatDeductible} onChange={(e) => setFilters({ ...filters, vatDeductible: e.target.value })}>
            <option value="">{t("register.manualReceipt.none")}</option>
            <option value="yes">{t("register.manualReceipt.yes")}</option>
            <option value="no">{t("register.manualReceipt.no")}</option>
          </select>
        </label>
      </div>

      {summary && vatReport ? (
        <div className="grid gap-2 text-sm sm:grid-cols-4">
          <p>{t("register.manualReceipt.docs")}: <b>{summary.count}</b></p>
          <p>{t("register.manualReceipt.net")}: <b>{summary.beforeVat}</b></p>
          <p>{t("register.manualReceipt.vat")}: <b>{summary.vat}</b></p>
          <p>{t("register.manualReceipt.total")}: <b>{summary.total}</b></p>
          <p>{t("register.manualReceipt.deductibleVat")}: <b>{summary.deductibleVat}</b></p>
          <p>{t("register.manualReceipt.outputVat")}: <b>{vatReport.outputVat}</b></p>
          <p>{t("register.manualReceipt.inputVat")}: <b>{vatReport.inputVat}</b></p>
          <p>{t("register.manualReceipt.payable")}: <b>{vatReport.vatPayable}</b></p>
        </div>
      ) : null}

      <div className="hidden md:block">
        <table className="w-full text-right text-sm">
          <thead>
            <tr className="text-slate-500">
              <th>{t("register.fields.docDate")}</th>
              <th>{t("register.manualReceipt.docNumber")}</th>
              <th>{t("register.manualReceipt.supplier")}</th>
              <th>{t("register.manualReceipt.docType")}</th>
              <th>{t("register.manualReceipt.total")}</th>
              <th>{t("register.manualReceipt.statusSaved")}</th>
              <th>{t("register.manualReceipt.sourceFile")}</th>
              <th>PDF</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-slate-100">
                <td>{row.documentDate}</td>
                <td>{row.documentNumber || "—"}</td>
                <td>{row.supplierName}</td>
                <td>{row.documentType}</td>
                <td className="font-black">{row.totalAmount}</td>
                <td>{t("register.manualReceipt.statusSaved")}</td>
                <td>{row.attachmentPath ? <button type="button" className="font-bold" onClick={() => void openFile(row)}>{t("archive.sourceFile")}</button> : <span className="text-slate-400">{t("archive.sourceMissing")}</span>}</td>
                <td><a className="font-bold" href={`/api/finance/manual-receipts/${row.id}/pdf`} target="_blank" rel="noreferrer">PDF</a></td>
                <td className="space-x-2">
                  <button type="button" className="font-bold" onClick={() => edit(row)}>{t("register.manualReceipt.edit")}</button>
                  <button type="button" className="font-bold text-red-700" onClick={() => void remove(row.id)}>{t("register.manualReceipt.delete")}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="space-y-3 md:hidden">
        {rows.map((row) => (
          <article key={row.id} className="rounded-2xl border border-slate-200 p-3 text-sm">
            <p className="font-black">{row.documentNumber || "—"}</p>
            <p className="text-xs text-slate-500">{row.documentDate} · {row.supplierName}</p>
            <p className="font-black">{row.totalAmount} ₪</p>
            <p className="text-xs">{row.documentType} · {t("register.manualReceipt.statusSaved")}</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {row.attachmentPath ? (
                <button type="button" className="rounded-xl border px-2 py-2 text-xs font-black" onClick={() => void openFile(row)}>{t("archive.sourceFile")}</button>
              ) : (
                <span className="rounded-xl border px-2 py-2 text-center text-[11px] text-slate-400">{t("archive.sourceMissing")}</span>
              )}
              <a className="rounded-xl border px-2 py-2 text-center text-xs font-black" href={`/api/finance/manual-receipts/${row.id}/pdf`} target="_blank" rel="noreferrer">PDF</a>
            </div>
            <button type="button" className="mt-2 font-bold" onClick={() => edit(row)}>{t("register.manualReceipt.edit")}</button>
            <button type="button" className="mt-2 ms-3 font-bold text-red-700" onClick={() => void remove(row.id)}>{t("register.manualReceipt.delete")}</button>
          </article>
        ))}
      </div>
    </section>
  );
}
