"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { EXPENSE_TYPE_I18N, EXPENSE_TYPE_VALUES } from "@/lib/finance/expense-types";
import { PAYMENT_INSTRUMENT_OPTIONS, PAYMENT_METHOD_LABELS } from "@/lib/finance/document-payload";
import {
  MANUAL_DOCUMENT_TYPES,
  computeManualReceiptVat,
  type ManualVatMode,
} from "@/lib/finance/manual-receipt-vat";

type ReceiptRow = {
  id: string;
  documentDate: string;
  documentNumber: string | null;
  supplierName: string;
  supplierTaxId: string | null;
  documentType: string;
  category: string | null;
  description: string | null;
  amountBeforeVat: string;
  vatAmount: string;
  totalAmount: string;
  vatMode: ManualVatMode;
  vatDeductible: boolean;
  vatDeductibleAmount: string;
  paymentMethod: string | null;
  attachmentPath: string | null;
  attachmentBucket: string | null;
  attachmentMime: string | null;
  attachmentName: string | null;
  linkedFinancialDocumentId: string | null;
};

type ExpenseOption = { id: string; title: string; docDate: string | null; totalAmount: string };

type ListResponse = {
  ok: boolean;
  error?: string;
  data: ReceiptRow[];
  summary: { count: number; beforeVat: string; vat: string; total: string; deductibleVat: string };
  vatReport: { outputVat: string; inputVat: string; vatPayable: string };
  linkableExpenses: ExpenseOption[];
};

const emptyForm = {
  documentDate: "",
  documentNumber: "",
  supplierName: "",
  supplierTaxId: "",
  documentType: MANUAL_DOCUMENT_TYPES[0] as string,
  category: "",
  description: "",
  enteredAmount: "",
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
  const [form, setForm] = useState<{
    documentDate: string;
    documentNumber: string;
    supplierName: string;
    supplierTaxId: string;
    documentType: string;
    category: string;
    description: string;
    enteredAmount: string;
    vatMode: ManualVatMode;
    vatDeductible: boolean;
    paymentMethod: string;
    attachmentPath: string;
    attachmentBucket: string;
    attachmentMime: string;
    attachmentName: string;
    linkedFinancialDocumentId: string;
  }>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [rows, setRows] = useState<ReceiptRow[]>([]);
  const [expenses, setExpenses] = useState<ExpenseOption[]>([]);
  const [summary, setSummary] = useState<ListResponse["summary"] | null>(null);
  const [vatReport, setVatReport] = useState<ListResponse["vatReport"] | null>(null);
  const [filters, setFilters] = useState({ from: "", to: "", supplier: "", category: "", documentType: "", vatDeductible: "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const focusedReceipt = useRef<string | null>(null);

  const preview = useMemo(
    () =>
      computeManualReceiptVat({
        enteredAmount: form.enteredAmount,
        mode: form.vatMode,
        vatDeductible: form.vatDeductible,
      }),
    [form.enteredAmount, form.vatMode, form.vatDeductible],
  );

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
    if (!focusId || focusedReceipt.current === focusId) return;
    const row = rows.find((item) => item.id === focusId);
    if (!row) return;
    focusedReceipt.current = focusId;
    edit(row);
  }, [focusId, rows]);

  async function onFile(file: File) {
    const data = new FormData();
    data.set("file", file);
    data.set("category", "expense");
    const res = await fetch("/api/source-documents/upload", { method: "POST", body: data });
    const body = (await res.json()) as {
      ok: boolean;
      error?: string;
      data?: { storagePath: string; storageBucket: string; mimeType: string; fileName: string; viewUrl: string | null };
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
    const payload = {
      ...form,
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
    setEditingId(null);
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
      documentType: row.documentType,
      category: row.category ?? "",
      description: row.description ?? "",
      enteredAmount: entered,
      vatMode: row.vatMode,
      vatDeductible: row.vatDeductible,
      paymentMethod: row.paymentMethod ?? "",
      attachmentPath: row.attachmentPath ?? "",
      attachmentBucket: row.attachmentBucket ?? "",
      attachmentMime: row.attachmentMime ?? "",
      attachmentName: row.attachmentName ?? "",
      linkedFinancialDocumentId: row.linkedFinancialDocumentId ?? "",
    });
  }

  const field = "mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm";

  return (
    <section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-4">
      <h2 className="text-lg font-black text-slate-950">{t("register.manualReceipt.title")}</h2>
      {error ? <p className="text-sm font-semibold text-red-700">{error}</p> : null}
      <div className="grid gap-3 md:grid-cols-3">
        <label className="text-sm font-semibold">{t("register.fields.docDate")} *
          <input type="date" className={field} value={form.documentDate} onChange={(e) => setForm({ ...form, documentDate: e.target.value })} />
        </label>
        <label className="text-sm font-semibold">{t("register.manualReceipt.docNumber")}
          <input className={field} value={form.documentNumber} onChange={(e) => setForm({ ...form, documentNumber: e.target.value })} />
        </label>
        <label className="text-sm font-semibold">{t("register.manualReceipt.supplier")} *
          <input className={field} value={form.supplierName} onChange={(e) => setForm({ ...form, supplierName: e.target.value })} />
        </label>
        <label className="text-sm font-semibold">{t("register.manualReceipt.taxId")}
          <input className={field} value={form.supplierTaxId} onChange={(e) => setForm({ ...form, supplierTaxId: e.target.value })} />
        </label>
        <label className="text-sm font-semibold">{t("register.manualReceipt.docType")}
          <select className={field} value={form.documentType} onChange={(e) => setForm({ ...form, documentType: e.target.value })}>
            {MANUAL_DOCUMENT_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
        </label>
        <label className="text-sm font-semibold">{t("register.manualReceipt.category")}
          <select className={field} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            <option value="">{t("register.manualReceipt.none")}</option>
            {EXPENSE_TYPE_VALUES.map((type) => <option key={type} value={type}>{t(EXPENSE_TYPE_I18N[type])}</option>)}
          </select>
        </label>
        <label className="text-sm font-semibold">{t("register.manualReceipt.payment")}
          <select className={field} value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}>
            <option value="">{t("register.manualReceipt.none")}</option>
            {PAYMENT_INSTRUMENT_OPTIONS.map((method) => <option key={method} value={method}>{PAYMENT_METHOD_LABELS[method]}</option>)}
          </select>
        </label>
        <label className="text-sm font-semibold md:col-span-2">{t("register.manualReceipt.note")}
          <input className={field} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </label>
        <label className="text-sm font-semibold">{t("register.manualReceipt.linkExpense")}
          <select className={field} value={form.linkedFinancialDocumentId} onChange={(e) => setForm({ ...form, linkedFinancialDocumentId: e.target.value })}>
            <option value="">{t("register.manualReceipt.none")}</option>
            {expenses.map((expense) => (
              <option key={expense.id} value={expense.id}>{expense.title} · {expense.totalAmount}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="rounded-2xl border border-slate-200 p-3">
        <p className="font-black">{t("register.manualReceipt.vatCalc")}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {(["includes_vat", "before_vat", "no_vat"] as const).map((mode) => (
            <button key={mode} type="button" onClick={() => setForm({ ...form, vatMode: mode })} className={`rounded-full px-3 py-1 text-sm font-bold ${form.vatMode === mode ? "bg-slate-900 text-white" : "bg-slate-100"}`}>
              {t(mode === "includes_vat" ? "register.manualReceipt.includesVat" : mode === "before_vat" ? "register.manualReceipt.beforeVat" : "register.manualReceipt.noVat")}
            </button>
          ))}
        </div>
        <label className="mt-3 block text-sm font-semibold">{t("register.manualReceipt.amount")}
          <input className={field} inputMode="decimal" value={form.enteredAmount} onChange={(e) => setForm({ ...form, enteredAmount: e.target.value })} />
        </label>
        <p className="mt-3 text-sm font-semibold">{t("register.manualReceipt.deductible")}</p>
        <div className="mt-1 flex gap-2">
          <button type="button" onClick={() => setForm({ ...form, vatDeductible: true })} className={`rounded-full px-3 py-1 text-sm font-bold ${form.vatDeductible ? "bg-slate-900 text-white" : "bg-slate-100"}`}>{t("register.manualReceipt.yes")}</button>
          <button type="button" onClick={() => setForm({ ...form, vatDeductible: false })} className={`rounded-full px-3 py-1 text-sm font-bold ${!form.vatDeductible ? "bg-slate-900 text-white" : "bg-slate-100"}`}>{t("register.manualReceipt.no")}</button>
        </div>
        {preview ? (
          <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
            <div><dt>{t("register.manualReceipt.net")}</dt><dd className="font-black">{preview.amountBeforeVat}</dd></div>
            <div><dt>{t("register.manualReceipt.vat")}</dt><dd className="font-black">{preview.vatAmount}</dd></div>
            <div><dt>{t("register.manualReceipt.total")}</dt><dd className="font-black">{preview.totalAmount}</dd></div>
          </dl>
        ) : null}
        <label className="mt-3 inline-flex cursor-pointer rounded-xl bg-slate-100 px-3 py-2 text-sm font-bold">
          {t("register.manualReceipt.attach")}
          <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) void onFile(file); }} />
        </label>
        {form.attachmentName ? <p className="mt-1 text-xs text-slate-600">{form.attachmentName}</p> : null}
        <button type="button" disabled={saving} onClick={() => void save()} className="mt-3 rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white">{t("register.manualReceipt.save")}</button>
      </div>

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

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-start text-slate-500">
              <th>{t("register.fields.docDate")}</th>
              <th>{t("register.manualReceipt.supplier")}</th>
              <th>{t("register.manualReceipt.docNumber")}</th>
              <th>{t("register.manualReceipt.docType")}</th>
              <th>{t("register.manualReceipt.net")}</th>
              <th>{t("register.manualReceipt.vat")}</th>
              <th>{t("register.manualReceipt.total")}</th>
              <th>{t("register.manualReceipt.deductible")}</th>
              <th>{t("register.manualReceipt.file")}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-slate-100">
                <td>{row.documentDate}</td>
                <td>{row.supplierName}</td>
                <td>{row.documentNumber}</td>
                <td>{row.documentType}</td>
                <td>{row.amountBeforeVat}</td>
                <td>{row.vatAmount}</td>
                <td>{row.totalAmount}</td>
                <td>{row.vatDeductible ? t("register.manualReceipt.yes") : t("register.manualReceipt.no")}</td>
                <td>{row.attachmentName ? <button type="button" className="font-bold" onClick={() => void openFile(row)}>{t("register.manualReceipt.view")}</button> : "—"}</td>
                <td className="space-x-2 whitespace-nowrap">
                  <button type="button" className="font-bold" onClick={() => edit(row)}>{t("register.manualReceipt.edit")}</button>
                  {row.attachmentName ? <button type="button" className="font-bold" onClick={() => void openFile(row)}>{t("register.manualReceipt.download")}</button> : null}
                  <button type="button" className="font-bold text-red-700" onClick={() => void remove(row.id)}>{t("register.manualReceipt.delete")}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
