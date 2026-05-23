"use client";

import {
  AlertTriangle,
  Calculator,
  Calendar,
  CheckCircle2,
  CreditCard,
  FileText,
  Package,
  Plus,
  Receipt,
  Truck,
  Trash2,
  TrendingDown,
  TrendingUp,
  User,
} from "lucide-react";
import { useEffect, useState } from "react";
import { ExpenseEmployeePayForm } from "@/components/finance/expense-employee-pay-form";
import { ExpenseSupplierLines } from "@/components/finance/expense-supplier-lines";
import { ProductPickerCatalogProvider } from "@/components/finance/product-picker-catalog-context";
import { ProductLinePicker } from "@/components/finance/product-line-picker";
import { SupplierCatalogPanel } from "@/components/finance/supplier-catalog-panel";
import { FloatingSelect } from "@/components/ui/floating-select";
import { getDocumentTypeOptions } from "@/lib/finance/document-type-labels";
import { documentTypeForEmployeePay } from "@/lib/finance/employee-pay-types";
import { EXPENSE_TYPE_I18N, EXPENSE_TYPE_VALUES, type ExpenseType } from "@/lib/finance/expense-types";
import { REGISTER_LABEL_KEYS as LK } from "@/lib/i18n/register-label-keys";
import type { ProductPickerRow } from "@/lib/finance/product-picker-catalog";
import {
  DEPOSIT_TYPE_LABELS,
  DEPOSIT_TYPE_OPTIONS,
  emptyCheckDetails,
  incomeExpenseDepositAmount,
  incomeExpenseGrandTotal,
  incomeExpenseTotalToPay,
  incomeExpenseVatTotal,
  lineGrossTotal,
  lineNetTotal,
  lineVatTotal,
  newPaymentId,
  paymentLinesTotal,
  PAYMENT_METHOD_LABELS,
  PAYMENT_INSTRUMENT_OPTIONS,
  VAT_MODE_LABELS,
  type IncomeExpensePayload,
  type PaymentCheckDetailsPayload,
  type PaymentLinePayload,
  type VatMode,
} from "@/lib/finance/document-payload";
import { useI18n } from "@/components/i18n-provider";
import { formatShekel, parseNum } from "@/lib/format-shekel";

const inputClass =
  "mt-1 block h-11 min-h-[44px] w-full rounded-[16px] border border-slate-300 bg-white px-3 text-right text-sm text-slate-900 shadow-sm outline-none transition focus:border-luxury-gold focus:ring-2 focus:ring-luxury-gold/25";

const labelClass = "block text-[13px] font-bold text-slate-700";

const lineQtyClass =
  "h-11 min-h-[44px] w-[90px] rounded-[16px] border border-slate-200 px-2 text-right text-sm outline-none focus:border-luxury-gold focus:ring-1 focus:ring-luxury-gold/25";

const lineMoneyClass =
  "h-11 min-h-[44px] w-full min-w-[5rem] rounded-[16px] border border-slate-200 px-2 text-right text-sm outline-none focus:border-luxury-gold focus:ring-1 focus:ring-luxury-gold/25";

const lineSelectClass =
  "h-11 min-h-[44px] w-full rounded-[16px] border border-slate-200 px-1 text-right text-[13px] font-semibold outline-none focus:border-luxury-gold";

type Props = {
  heading: string;
  headingClass?: string;
  iconClass?: string;
  intro: string;
  value: IncomeExpensePayload;
  onChange: (next: IncomeExpensePayload) => void;
  disabled?: boolean;
  counterpartyInputId?: string;
  /** Enter בשדה האחרון בתשלום עובד — שמירה */
  onWorkerPaySubmit?: () => void;
};

export function IncomeExpenseFields({
  heading,
  headingClass = "text-slate-950",
  iconClass = "text-cyan-600",
  intro,
  value,
  onChange,
  disabled = false,
  counterpartyInputId,
  onWorkerPaySubmit,
}: Props) {
  const { t, bcp47 } = useI18n();
  void bcp47;
  const isExpense = value.kind === "expense";
  const showEventFields = !isExpense && value.clientMode === "event";
  const activeExpenseType = value.expenseType ?? "SUPPLIER_PAYMENTS";
  const isSupplierExpense = isExpense && activeExpenseType === "SUPPLIER_PAYMENTS";
  const isWorkerExpense = isExpense && activeExpenseType === "WORKER_PAYMENTS";
  const isPartyOnlyExpense =
    isExpense &&
    (activeExpenseType === "DAILY_PAYMENTS" ||
      activeExpenseType === "EXTERNAL_PAYMENTS" ||
      activeExpenseType === "INVESTMENTS");
  const [focusLineId, setFocusLineId] = useState<string | null>(null);
  const [customerSuggestions, setCustomerSuggestions] = useState<string[]>([]);
  const [procurementSuppliers, setProcurementSuppliers] = useState<{ id: string; name: string }[]>([]);
  const [employees, setEmployees] = useState<{ id: string; name: string }[]>([]);
  const documentTypeOptions = getDocumentTypeOptions(t);
  const supplierOptions = [
    { value: "", label: t("register.procurement.noSupplier") },
    ...procurementSuppliers.map((s) => ({ value: s.id, label: s.name })),
  ];
  const selectedSupplier = procurementSuppliers.find((s) => s.id === value.supplierId);
  const catalogTargetLineId = focusLineId ?? value.lines[0]?.id ?? null;

  const lineTotals = value.lines.map((row) => lineGrossTotal(row.quantity, row.price, row.vatMode));
  const netLineTotals = value.lines.map((row) => lineNetTotal(row.quantity, row.price, row.vatMode));
  const vatLineTotals = value.lines.map((row) => lineVatTotal(row.quantity, row.price, row.vatMode));
  const vatTotal = incomeExpenseVatTotal(value);
  const grandTotal = incomeExpenseGrandTotal(value);
  const depositAmount = incomeExpenseDepositAmount(value);
  const totalToPay = incomeExpenseTotalToPay(value);
  const showDepositBox = !isExpense && (value.clientMode === "event" || value.includeDeposit);

  const setPatch = (patch: Partial<IncomeExpensePayload>) => onChange({ ...value, ...patch });

  const setExpenseType = (type: ExpenseType) => {
    const patch: Partial<IncomeExpensePayload> = { expenseType: type };
    if (type !== "SUPPLIER_PAYMENTS") patch.supplierId = null;
    if (type !== "WORKER_PAYMENTS") {
      patch.employeeId = null;
    } else if (type === "WORKER_PAYMENTS") {
      patch.supplierId = null;
      patch.employeePayType = value.employeePayType ?? "salary";
      patch.documentType = documentTypeForEmployeePay(patch.employeePayType ?? "salary");
      patch.employeePayAmount = value.employeePayAmount ?? "";
      patch.employeePayNotes = value.employeePayNotes ?? "";
    }
    if (type === "DAILY_PAYMENTS" || type === "EXTERNAL_PAYMENTS" || type === "INVESTMENTS") {
      patch.supplierId = null;
      patch.employeeId = null;
    }
    onChange({ ...value, ...patch });
  };

  const addLine = () => {
    const newId = `line-${Math.random().toString(36).slice(2, 10)}`;
    onChange({
      ...value,
      lines: [
        ...value.lines,
        {
          id: newId,
          itemName: "",
          quantity: "1",
          price: "",
          vatMode: "includes_vat" as VatMode,
          supplierProductId: null,
          lineNote: "",
        },
      ],
    });
    setFocusLineId(newId);
  };

  const applyProductPick = (lineId: string, picked: ProductPickerRow) => {
    const regular = picked.lastPrice;
    const patch: Partial<(typeof value.lines)[number]> = {
      itemName: picked.name,
      supplierProductId: picked.supplierProductId,
      vatMode: picked.vatMode,
    };
    if (regular > 0) {
      patch.price = String(regular);
      if (picked.supplierProductId) {
        patch.priceFlag = { regularPrice: regular, samples: 0, flag: "match" };
      } else {
        patch.priceFlag = null;
      }
    }
    updateLine(lineId, patch);

    if (isExpense && picked.supplierId && !value.supplierId && picked.supplierName) {
      setPatch({
        supplierId: picked.supplierId,
        counterpartyName: picked.supplierName,
      });
    }
  };

  const removeLine = (id: string) => {
    if (value.lines.length <= 1) return;
    onChange({ ...value, lines: value.lines.filter((row) => row.id !== id) });
  };

  const updateLine = (id: string, patch: Partial<(typeof value.lines)[number]>) => {
    onChange({
      ...value,
      lines: value.lines.map((row) => {
        if (row.id !== id) return row;
        const next = { ...row, ...patch };
        // Re-evaluate the OCR price flag when the user edits the unit price so
        // the badge stays in sync (e.g. user corrects to the regular price → match).
        if (patch.price !== undefined && next.priceFlag && next.priceFlag.regularPrice) {
          const newPrice = Number(next.price);
          const baseline = next.priceFlag.regularPrice;
          if (Number.isFinite(newPrice) && newPrice > 0) {
            const ratio = (newPrice - baseline) / baseline;
            const threshold = 0.15;
            next.priceFlag = {
              ...next.priceFlag,
              flag:
                ratio >= threshold
                  ? "higher"
                  : ratio <= -threshold
                    ? "lower"
                    : "match",
            };
          }
        }
        return next;
      }),
    });
  };

  const updatePayment = (id: string, patch: Partial<PaymentLinePayload>) => {
    onChange({
      ...value,
      payments: value.payments.map((row) => {
        if (row.id !== id) return row;
        const next = { ...row, ...patch } as PaymentLinePayload;
        if (next.instrument === "CHECK" && !next.check) {
          next.check = emptyCheckDetails();
        }
        if (next.instrument !== "CHECK" && next.check) {
          delete next.check;
        }
        return next;
      }),
    });
  };

  const updatePaymentCheck = (
    paymentId: string,
    patch: Partial<PaymentCheckDetailsPayload>,
  ) => {
    onChange({
      ...value,
      payments: value.payments.map((row) =>
        row.id === paymentId
          ? {
              ...row,
              check: { ...(row.check ?? emptyCheckDetails()), ...patch },
            }
          : row,
      ),
    });
  };

  const addPayment = () => {
    onChange({
      ...value,
      payments: [
        ...value.payments,
        {
          id: newPaymentId(),
          instrument: PAYMENT_INSTRUMENT_OPTIONS[0],
          amount: "",
          notes: "",
        },
      ],
    });
  };

  const removePayment = (id: string) => {
    if (value.payments.length <= 1) return;
    onChange({ ...value, payments: value.payments.filter((row) => row.id !== id) });
  };

  const fetchCustomerSuggestions = async (query: string) => {
    const q = query.trim();
    if (q.length < 1) {
      setCustomerSuggestions([]);
      return;
    }
    try {
      const res = await fetch(`/api/customers?q=${encodeURIComponent(q)}`, {
        credentials: "same-origin",
      });
      const j = (await res.json()) as { ok?: boolean; data?: { name: string }[] };
      setCustomerSuggestions(j.ok ? (j.data ?? []).map((row) => row.name) : []);
    } catch {
      setCustomerSuggestions([]);
    }
  };

  useEffect(() => {
    if (isExpense) return;
    const q = value.counterpartyName.trim();
    if (q.length < 1) {
      setCustomerSuggestions([]);
      return;
    }
    const tmr = window.setTimeout(() => {
      void fetchCustomerSuggestions(q);
    }, 400);
    return () => window.clearTimeout(tmr);
  }, [value.counterpartyName, isExpense]);

  useEffect(() => {
    if (!isExpense) return;
    void (async () => {
      try {
        const res = await fetch("/api/procurement/suppliers", { credentials: "same-origin" });
        const j = (await res.json()) as { ok?: boolean; data?: { id: string; name: string }[] };
        if (j.ok && j.data) setProcurementSuppliers(j.data.map((r) => ({ id: r.id, name: r.name })));
      } catch {
        setProcurementSuppliers([]);
      }
    })();
  }, [isExpense]);

  useEffect(() => {
    if (!isWorkerExpense) return;
    void (async () => {
      try {
        const res = await fetch("/api/employees", { credentials: "same-origin" });
        const j = (await res.json()) as { ok?: boolean; data?: { id: string; name: string }[] };
        if (j.ok && j.data) setEmployees(j.data.map((r) => ({ id: r.id, name: r.name })));
      } catch {
        setEmployees([]);
      }
    })();
  }, [isWorkerExpense]);

  useEffect(() => {
    if (value.payments.length > 0) return;
    onChange({
      ...value,
      payments: [
        {
          id: newPaymentId(),
          instrument: PAYMENT_INSTRUMENT_OPTIONS[0],
          amount: "",
          notes: "",
        },
      ],
    });
  }, [onChange, value]);

  const paymentTone = isExpense
    ? {
        border: "border-rose-200",
        bg: "bg-rose-50/75",
        icon: "text-rose-700",
        title: "text-rose-950",
        chip: "bg-rose-100 text-rose-900",
      }
    : {
        border: "border-emerald-200",
        bg: "bg-emerald-50/75",
        icon: "text-emerald-700",
        title: "text-emerald-950",
        chip: "bg-emerald-100 text-emerald-900",
      };
  const paidInput = paymentLinesTotal(value);
  const paymentOverpaid = paidInput > totalToPay + 1e-6 && totalToPay >= 0;
  const remainingShow = Math.max(0, totalToPay - paidInput);

  return (
    <ProductPickerCatalogProvider supplierId={isSupplierExpense ? value.supplierId : null}>
    <section className="app-panel mb-[14px] p-[18px]">
      <fieldset disabled={disabled} className={disabled ? "pointer-events-none opacity-60" : ""}>
      <div className="flex flex-wrap items-center gap-2">
        <Receipt className={`h-4 w-4 ${iconClass}`} aria-hidden />
        <h2 className={`text-[22px] font-extrabold ${headingClass}`}>{heading}</h2>
      </div>
      <p className="mt-1 text-[13px] leading-snug text-slate-600 opacity-70">{intro}</p>

      {isExpense ? (
        <div className="mt-3" role="group" aria-labelledby="expense-type-label">
          <p id="expense-type-label" className="text-[13px] font-black text-slate-800">
            {t("register.expenseTypes.label")}
          </p>
          <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-labelledby="expense-type-label">
            {EXPENSE_TYPE_VALUES.map((type) => {
              const active = activeExpenseType === type;
              return (
                <button
                  key={type}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setExpenseType(type as ExpenseType)}
                  className={`min-h-[44px] shrink-0 rounded-[16px] border px-3 py-2 text-[12px] font-bold leading-snug transition sm:px-4 sm:text-[13px] ${
                    active
                      ? "border-cyan-800 bg-cyan-800 text-white shadow-md ring-2 ring-cyan-800/25"
                      : "border-slate-200 bg-white text-slate-800 hover:border-cyan-300 hover:bg-cyan-50/60"
                  }`}
                >
                  {t(EXPENSE_TYPE_I18N[type])}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="mt-3">
          <p className="text-[13px] font-black text-slate-800">{t(LK.clientType)}</p>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setPatch({ clientMode: "general" })}
              className={`h-11 rounded-[16px] border px-[18px] text-[14px] font-bold transition sm:text-[15px] ${
                value.clientMode === "general"
                  ? "border-luxury-gold bg-luxury-gold text-luxury-charcoal shadow-sm"
                  : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
              }`}
            >
              {t(LK.clientGeneral)}
            </button>
            <button
              type="button"
              onClick={() => setPatch({ clientMode: "event" })}
              className={`h-11 rounded-[16px] border px-[18px] text-[14px] font-bold transition sm:text-[15px] ${
                value.clientMode === "event"
                  ? "border-amber-700 bg-amber-700 text-white shadow-sm"
                  : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
              }`}
            >
              {t(LK.clientEvent)}
            </button>
          </div>
        </div>
      )}

      {!isWorkerExpense ? (
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {isPartyOnlyExpense ? (
          <label className={labelClass}>
            <span className="flex items-center gap-2">
              <User className="h-4 w-4 text-slate-500" aria-hidden />
              {t("register.fields.partyName")}
            </span>
            <input
              id={counterpartyInputId}
              type="text"
              value={value.counterpartyName}
              onChange={(e) => setPatch({ counterpartyName: e.target.value })}
              className={inputClass}
              placeholder={t("register.fields.partyPlaceholder")}
            />
          </label>
        ) : (
          <label className={labelClass}>
            <span className="flex items-center gap-2">
              <User className="h-4 w-4 text-slate-500" aria-hidden />
              {isExpense ? t("register.fields.supplierOrParty") : t("register.fields.customerName")}
            </span>
            <input
              id={counterpartyInputId}
              type="text"
              value={value.counterpartyName}
              list={isExpense ? undefined : "customer-suggestions"}
              onChange={(e) => setPatch({ counterpartyName: e.target.value })}
              className={inputClass}
              placeholder={isExpense ? t("register.fields.supplierExample") : t("register.fields.customerExample")}
            />
            {!isExpense ? (
              <datalist id="customer-suggestions">
                {customerSuggestions.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            ) : null}
          </label>
        )}
        <label className={labelClass}>
          <span className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-slate-500" aria-hidden />
            {t("common.date")}
          </span>
          <input type="date" value={value.docDate} onChange={(e) => setPatch({ docDate: e.target.value })} className={inputClass} />
        </label>
        <label className={`md:col-span-2 ${labelClass}`}>
            <span className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-slate-500" aria-hidden />
              {t("register.fields.documentType")}
            </span>
            <FloatingSelect
              value={value.documentType || documentTypeOptions[0]?.value || ""}
              onChange={(v) => setPatch({ documentType: v })}
              options={documentTypeOptions}
              disabled={disabled}
              className="mt-1"
            />
          </label>
      </div>
      ) : null}

      {isSupplierExpense ? (
        <div className="mt-3 rounded-[18px] border border-slate-200 bg-gradient-to-b from-slate-50/90 to-white p-[18px] shadow-sm">
          <p className="flex items-center gap-2 text-[13px] font-black text-slate-800">
            <Truck className="h-4 w-4 shrink-0 text-slate-600" aria-hidden />
            {t("register.procurement.title")}
          </p>
          <p className="mt-1 text-[12px] leading-snug text-slate-600">{t("register.procurement.hint")}</p>
          <label className={`mt-3 block ${labelClass}`}>
            {t("register.procurement.supplierSelect")}
            <FloatingSelect
              value={value.supplierId ?? ""}
              onChange={(id) => {
                const hit = procurementSuppliers.find((s) => s.id === id);
                if (!id) {
                  setPatch({
                    supplierId: null,
                    lines: value.lines.map((l) => ({ ...l, supplierProductId: null, priceFlag: null })),
                  });
                  return;
                }
                setPatch({
                  supplierId: id,
                  counterpartyName: hit?.name ?? value.counterpartyName,
                  lines: value.lines.map((l) => ({
                    ...l,
                    supplierProductId: null,
                    priceFlag: null,
                  })),
                });
              }}
              options={supplierOptions}
              searchable
              disabled={disabled}
              className="mt-1"
            />
          </label>
          {value.supplierId && selectedSupplier ? (
            <SupplierCatalogPanel
              supplierId={value.supplierId}
              supplierName={selectedSupplier.name}
              targetLineId={catalogTargetLineId}
              disabled={disabled}
              onApplyToLine={(lineId, picked) => applyProductPick(lineId, picked)}
            />
          ) : null}
        </div>
      ) : null}

      {isSupplierExpense ? (
        <ExpenseSupplierLines
          value={value}
          onChange={onChange}
          disabled={disabled}
          supplierId={value.supplierId ?? null}
          focusLineId={focusLineId}
          setFocusLineId={setFocusLineId}
          onApplyProductPick={applyProductPick}
        />
      ) : null}

      {isWorkerExpense ? (
        <ExpenseEmployeePayForm
          value={value}
          onChange={onChange}
          disabled={disabled}
          employees={employees}
          onSubmit={onWorkerPaySubmit}
        />
      ) : null}

      {showEventFields && (
        <div className="mt-3 rounded-[18px] border border-amber-200 bg-amber-50/80 p-[18px]">
          <p className="text-[13px] font-black text-amber-900">{t("register.event.title")}</p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <label className={labelClass}>
              {t("register.event.trayQty")}
              <input
                type="number"
                min={0}
                value={value.trayQty}
                onChange={(e) => setPatch({ trayQty: e.target.value })}
                className={inputClass}
                placeholder="0"
              />
            </label>
            <label className={labelClass}>
              {t("register.event.returnDate")}
              <input type="date" value={value.returnDate} onChange={(e) => setPatch({ returnDate: e.target.value })} className={inputClass} />
            </label>
          </div>
        </div>
      )}

      {!isSupplierExpense && !isWorkerExpense ? (
      <div className="mt-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[15px] font-black text-slate-900">{t("register.lines.title")}</p>
          <button
            type="button"
            onClick={addLine}
            className="inline-flex h-9 items-center gap-1.5 rounded-[16px] bg-luxury-gold px-3 py-1.5 text-[13px] font-bold text-luxury-charcoal shadow-sm hover:bg-luxury-gold-hover"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            {t("register.lines.addLine")}
          </button>
        </div>

        <div
          className="mt-3 overflow-x-auto rounded-[18px] border border-slate-200"
          onKeyDown={(e) => {
            if (e.key !== "Enter" || e.shiftKey) return;
            const tag = (e.target as HTMLElement).tagName;
            if (tag === "TEXTAREA" || tag === "BUTTON") return;
            e.preventDefault();
            addLine();
          }}
        >
          <table className="min-w-[980px] w-full divide-y divide-slate-200 text-right text-[13px]">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-2 py-[10px] font-bold text-slate-600">{t("register.lines.itemName")}</th>
                <th className="px-2 py-[10px] font-bold text-slate-600">{t("register.fields.quantity")}</th>
                <th className="px-2 py-[10px] font-bold text-slate-600">{t("register.fields.unitPrice")}</th>
                <th className="px-2 py-[10px] font-bold text-slate-600">{t("register.lines.vat")}</th>
                <th className="px-2 py-[10px] font-bold text-slate-600">{t("register.lines.beforeVat")}</th>
                <th className="px-2 py-[10px] font-bold text-slate-600">{t("register.lines.vat")}</th>
                <th className="px-2 py-[10px] font-bold text-slate-600">{t("register.fields.lineTotal")}</th>
                <th className="w-12 px-2 py-[10px] font-bold text-slate-600" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {value.lines.map((row, index) => (
                <tr key={row.id} className="h-[68px]">
                  <td className="px-2 py-[10px] align-middle">
                    <ProductLinePicker
                      value={row.itemName}
                      supplierId={isExpense ? value.supplierId : null}
                      disabled={disabled}
                      autoOpen={focusLineId === row.id}
                      onAutoOpenDone={() => setFocusLineId(null)}
                      placeholder={t("register.lines.itemPlaceholder", { n: index + 1 })}
                      onFocusLine={() => setFocusLineId(row.id)}
                      onChange={(name) => {
                        setFocusLineId(row.id);
                        updateLine(row.id, { itemName: name });
                        if (!name.trim() && row.supplierProductId) {
                          updateLine(row.id, { supplierProductId: null, priceFlag: null });
                        }
                      }}
                      onSelect={(picked) => applyProductPick(row.id, picked)}
                    />
                  </td>
                  <td className="px-2 py-[10px] align-middle">
                    <input
                      type="number"
                      min={0}
                      step="0.001"
                      value={row.quantity}
                      onChange={(e) => updateLine(row.id, { quantity: e.target.value })}
                      className={lineQtyClass}
                    />
                  </td>
                  <td className="px-2 py-[10px] align-middle">
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={row.price}
                      onChange={(e) => updateLine(row.id, { price: e.target.value })}
                      className={`${lineMoneyClass} ${
                        row.priceFlag?.flag === "higher"
                          ? "border-rose-400 bg-rose-50"
                          : row.priceFlag?.flag === "lower"
                            ? "border-emerald-400 bg-emerald-50"
                            : ""
                      }`}
                      title={
                        row.priceFlag?.regularPrice
                          ? t("register.priceFlag.tooltip", {
                              price: formatShekel(row.priceFlag.regularPrice),
                              samples: row.priceFlag.samples ?? 0,
                            })
                          : undefined
                      }
                    />
                    {row.priceFlag ? (
                      <p
                        className={`mt-1 inline-flex items-center gap-1 text-[11px] font-bold ${
                          row.priceFlag.flag === "higher"
                            ? "text-rose-700"
                            : row.priceFlag.flag === "lower"
                              ? "text-emerald-700"
                              : "text-slate-500"
                        }`}
                      >
                        {row.priceFlag.flag === "higher" && (
                          <>
                            <AlertTriangle className="h-3 w-3" aria-hidden />
                            <TrendingUp className="h-3 w-3" aria-hidden />
                            {t("register.priceFlag.higher")}
                          </>
                        )}
                        {row.priceFlag.flag === "lower" && (
                          <>
                            <TrendingDown className="h-3 w-3" aria-hidden />
                            {t("register.priceFlag.lower")}
                          </>
                        )}
                        {row.priceFlag.flag === "match" && (
                          <>
                            <CheckCircle2 className="h-3 w-3" aria-hidden />
                            {t("register.priceFlag.match")}
                          </>
                        )}
                        {row.priceFlag.regularPrice ? (
                          <span className="opacity-75">
                            ({formatShekel(row.priceFlag.regularPrice)})
                          </span>
                        ) : null}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-2 py-[10px] align-middle">
                    <select
                      value={row.vatMode}
                      onChange={(e) => updateLine(row.id, { vatMode: e.target.value as VatMode })}
                      className={lineSelectClass}
                    >
                      {(Object.keys(VAT_MODE_LABELS) as VatMode[]).map((k) => (
                        <option key={k} value={k}>
                          {VAT_MODE_LABELS[k]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-[10px] align-middle text-[15px] font-bold text-slate-700 tabular-nums">
                    {formatShekel(netLineTotals[index] ?? 0)}
                  </td>
                  <td className="px-2 py-[10px] align-middle text-[15px] font-bold text-slate-700 tabular-nums">
                    {formatShekel(vatLineTotals[index] ?? 0)}
                  </td>
                  <td className="px-2 py-[10px] align-middle text-[15px] font-bold text-slate-900 tabular-nums">
                    {formatShekel(lineTotals[index] ?? 0)}
                  </td>
                  <td className="px-2 py-[10px] align-middle">
                    <button
                      type="button"
                      onClick={() => removeLine(row.id)}
                      className="rounded-lg p-1.5 text-rose-600 hover:bg-rose-50"
                      aria-label={t("register.lines.deleteLine")}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      ) : null}

      {!isWorkerExpense ? (
      <div className="mt-3 flex min-h-[70px] flex-wrap items-center justify-between gap-4 rounded-[18px] border border-cyan-200 bg-cyan-50/70 px-[18px] py-3">
        <span className="flex items-center gap-2 text-[13px] font-bold text-cyan-900">
          <Calculator className="h-4 w-4 shrink-0" aria-hidden />
          {t("register.summary.title")}
        </span>
        <div className="flex flex-1 flex-wrap items-end justify-end gap-6 sm:gap-10">
          <div className="text-center sm:text-right">
            <p className="text-[13px] font-bold text-slate-600 opacity-70">{t("common.total")}</p>
            <p className="text-[28px] font-black tabular-nums leading-none text-slate-950">{formatShekel(grandTotal)}</p>
          </div>
          <div className="text-center sm:text-right">
            <p className="text-[13px] font-bold text-slate-600 opacity-70">{t("register.lines.vat")}</p>
            <p className="text-[28px] font-black tabular-nums leading-none text-slate-950">{formatShekel(vatTotal)}</p>
          </div>
          <div className="text-center sm:text-right">
            <p className="text-[13px] font-bold text-slate-600 opacity-70">{t("register.summary.toPay")}</p>
            <p className="text-[28px] font-black tabular-nums leading-none text-cyan-900">{formatShekel(totalToPay)}</p>
          </div>
        </div>
      </div>
      ) : null}

        {showDepositBox && (
          <details className="mt-3 rounded-[18px] border border-amber-200 bg-amber-50/75 p-[18px] shadow-sm">
            <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 text-[13px] font-black text-amber-950">
              <Package className="h-4 w-4 text-amber-700" aria-hidden />
              {t("register.deposit.title")}
              {value.includeDeposit && depositAmount > 0 ? (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-950">
                  {formatShekel(depositAmount)}
                </span>
              ) : null}
            </summary>
            <div className="mt-3 grid gap-3 md:grid-cols-[auto_1fr_1fr]">
              <label className="flex h-11 min-h-[44px] items-center gap-2 rounded-[16px] border border-amber-200 bg-white px-3 text-[13px] font-bold text-slate-800">
                <input
                  type="checkbox"
                  checked={value.includeDeposit}
                  onChange={(e) =>
                    setPatch({
                      includeDeposit: e.target.checked,
                      depositAmount: e.target.checked ? value.depositAmount : "",
                      depositNote: e.target.checked ? value.depositNote : "",
                    })
                  }
                  className="h-4 w-4 accent-amber-700"
                />
                {t("register.deposit.include")}
              </label>
              <label className={labelClass}>
                {t("register.deposit.type")}
                <select
                  value={value.depositType || DEPOSIT_TYPE_OPTIONS[0]}
                  onChange={(e) => setPatch({ depositType: e.target.value })}
                  disabled={!value.includeDeposit}
                  className={inputClass}
                >
                  {DEPOSIT_TYPE_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {DEPOSIT_TYPE_LABELS[opt]}
                    </option>
                  ))}
                </select>
              </label>
              <label className={labelClass}>
                {t("register.deposit.amount")}
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={value.depositAmount}
                  onChange={(e) => setPatch({ depositAmount: e.target.value })}
                  disabled={!value.includeDeposit}
                  className={inputClass}
                  placeholder="0"
                />
              </label>
              <label className={`md:col-span-3 ${labelClass}`}>
                {t("register.deposit.note")}
                <textarea
                  value={value.depositNote}
                  onChange={(e) => setPatch({ depositNote: e.target.value })}
                  disabled={!value.includeDeposit}
                  className="mt-1 block min-h-[52px] w-full resize-y rounded-[16px] border border-slate-300 bg-white px-3 py-2 text-right text-[15px] text-slate-900 shadow-sm outline-none transition focus:border-luxury-gold focus:ring-2 focus:ring-luxury-gold/25 disabled:opacity-60"
                  placeholder={t("register.deposit.notePlaceholder")}
                />
              </label>
            </div>
          </details>
        )}

        {depositAmount > 0 ? (
          <p className="mt-3 rounded-[16px] border border-amber-100 bg-amber-50/90 px-3 py-2 text-[13px] font-semibold text-amber-950">
            {t("register.deposit.label")} <span className="font-black tabular-nums">{formatShekel(depositAmount)}</span>
          </p>
        ) : null}

        <div className={`mt-3 rounded-[18px] border ${paymentTone.border} ${paymentTone.bg} p-[18px]`}>
            <div className="flex h-[58px] flex-wrap items-center gap-2 border-b border-slate-200/80">
              <CreditCard className={`h-3.5 w-3.5 ${paymentTone.icon}`} aria-hidden />
              <p className={`text-[15px] font-black ${paymentTone.title}`}>{t("register.payment.detailsTitle")}</p>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${paymentTone.chip}`}>
                {isExpense ? t("register.payment.expenseBadge") : t("register.payment.incomeBadge")}
              </span>
              <button
                type="button"
                onClick={addPayment}
                className="me-auto inline-flex h-8 items-center rounded-[16px] bg-white px-2.5 py-1 text-[12px] font-bold text-slate-800 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50"
              >
                {t("register.payment.addMethod")}
              </button>
            </div>
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              {value.payments.map((payment) => {
                const isCheck = payment.instrument === "CHECK";
                const checkDetails = payment.check ?? emptyCheckDetails();
                return (
                  <div
                    key={payment.id}
                    className={`overflow-hidden rounded-[16px] border bg-white px-3 py-2 shadow-sm transition-all duration-300 ease-out ${
                      isCheck
                        ? "border-amber-300 ring-1 ring-amber-200/70"
                        : "border-slate-200"
                    }`}
                  >
                    <div className="grid min-h-[58px] items-center gap-x-2 gap-y-2 sm:grid-cols-[1fr_0.85fr_1.15fr_auto]">
                      <label className={`${labelClass} mb-0`}>
                        {t("register.fields.paymentMethod")}
                        <select
                          value={payment.instrument || PAYMENT_INSTRUMENT_OPTIONS[0]}
                          onChange={(e) => updatePayment(payment.id, { instrument: e.target.value })}
                          className={inputClass}
                        >
                          {PAYMENT_INSTRUMENT_OPTIONS.map((opt) => (
                            <option key={opt} value={opt}>
                              {PAYMENT_METHOD_LABELS[opt]}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className={labelClass}>
                        {t("common.amount")}
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={payment.amount}
                          onChange={(e) => updatePayment(payment.id, { amount: e.target.value })}
                          className={inputClass}
                          placeholder="0"
                        />
                      </label>
                      <label className={labelClass}>
                        {t("common.notes")}
                        <input
                          type="text"
                          value={payment.notes}
                          onChange={(e) => updatePayment(payment.id, { notes: e.target.value })}
                          className={inputClass}
                          placeholder={t("register.payment.notesPlaceholder")}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => removePayment(payment.id)}
                        className="self-center rounded-lg p-1.5 text-rose-600 hover:bg-rose-50 sm:self-end"
                        aria-label={t("register.payment.deletePayment")}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <div
                      className={`grid overflow-hidden transition-[grid-template-rows,opacity,margin] duration-300 ease-out ${
                        isCheck ? "mt-3 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                      }`}
                      aria-hidden={!isCheck}
                    >
                      <div className="min-h-0">
                        <div className="rounded-[14px] border border-amber-200/80 bg-amber-50/70 p-3">
                          <div className="mb-2 flex items-center gap-2 text-[12px] font-black text-amber-950">
                            <Receipt className="h-3.5 w-3.5" aria-hidden />
                            {t("register.check.detailsTitle")}
                          </div>
                          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                            <label className={labelClass}>
                              {t("register.check.checkNumber")}
                              <input
                                type="text"
                                value={checkDetails.checkNumber}
                                onChange={(e) =>
                                  updatePaymentCheck(payment.id, { checkNumber: e.target.value })
                                }
                                className={inputClass}
                                placeholder={t("register.check.checkNumberPlaceholder")}
                                disabled={disabled}
                              />
                            </label>
                            <label className={labelClass}>
                              {t("register.check.bank")}
                              <input
                                type="text"
                                value={checkDetails.bankName}
                                onChange={(e) =>
                                  updatePaymentCheck(payment.id, { bankName: e.target.value })
                                }
                                className={inputClass}
                                placeholder={t("register.check.bankPlaceholder")}
                                disabled={disabled}
                              />
                            </label>
                            <label className={labelClass}>
                              {t("register.check.branch")}
                              <input
                                type="text"
                                value={checkDetails.branch}
                                onChange={(e) =>
                                  updatePaymentCheck(payment.id, { branch: e.target.value })
                                }
                                className={inputClass}
                                placeholder={t("register.check.branchPlaceholder")}
                                disabled={disabled}
                              />
                            </label>
                            <label className={labelClass}>
                              {t("register.check.dueDate")}
                              <input
                                type="date"
                                value={checkDetails.dueDate}
                                onChange={(e) =>
                                  updatePaymentCheck(payment.id, { dueDate: e.target.value })
                                }
                                className={inputClass}
                                disabled={disabled}
                              />
                            </label>
                            <label className={`${labelClass} sm:col-span-2`}>
                              {t("register.check.holder")}
                              <input
                                type="text"
                                value={checkDetails.holderName}
                                onChange={(e) =>
                                  updatePaymentCheck(payment.id, { holderName: e.target.value })
                                }
                                className={inputClass}
                                placeholder={t("register.check.holderPlaceholder")}
                                disabled={disabled}
                              />
                            </label>
                          </div>
                          <p className="mt-2 text-[11px] font-semibold text-amber-900/80">
                            {t("register.check.autoCreateHint")}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {paymentOverpaid && (
              <p className="mt-2 text-[13px] font-bold text-rose-700" role="alert">
                {t("register.validations.paymentExceedsTotal")}
              </p>
            )}
            <div className="mt-4 grid gap-2 rounded-[14px] border border-slate-200 bg-white/90 px-3 py-2.5 text-[13px] font-bold sm:grid-cols-3">
              <div>
                <p className="text-[11px] font-semibold text-slate-500">{t("register.summary.docTotal")}</p>
                <p className="text-[18px] font-black tabular-nums text-slate-950">{formatShekel(totalToPay)}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold text-emerald-700">{t("register.summary.paid")}</p>
                <p className="text-[18px] font-black tabular-nums text-emerald-800">{formatShekel(paidInput)}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold text-amber-800">{t("register.summary.remaining")}</p>
                <p
                  className={`text-[18px] font-black tabular-nums ${
                    remainingShow > 1e-6 ? "text-amber-900" : "text-slate-400"
                  }`}
                >
                  {formatShekel(remainingShow)}
                </p>
              </div>
            </div>
        </div>
      </fieldset>
    </section>
    </ProductPickerCatalogProvider>
  );
}
