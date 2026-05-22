"use client";

import { Calendar, User } from "lucide-react";
import { useRef } from "react";
import { FloatingSelect } from "@/components/ui/floating-select";
import { useI18n } from "@/components/i18n-provider";
import {
  EMPLOYEE_PAY_TYPE_I18N,
  EMPLOYEE_PAY_TYPE_VALUES,
  documentTypeForEmployeePay,
  type EmployeePayType,
} from "@/lib/finance/employee-pay-types";
import {
  incomeExpenseTotalToPay,
  normalizeWorkerExpensePayload,
  workerExpenseLines,
  type IncomeExpensePayload,
} from "@/lib/finance/document-payload";
import { formatShekel } from "@/lib/format-shekel";

const inputClass =
  "mt-1 block h-11 min-h-[44px] w-full rounded-[16px] border border-slate-300 bg-white px-3 text-right text-sm text-slate-900 shadow-sm outline-none transition focus:border-luxury-gold focus:ring-2 focus:ring-luxury-gold/25";

const labelClass = "block text-[13px] font-bold text-slate-700";

const amountClass =
  "mt-2 block w-full rounded-[20px] border-2 border-emerald-300 bg-gradient-to-b from-white to-emerald-50/40 px-4 py-4 text-center text-[32px] font-black tabular-nums text-slate-950 shadow-sm outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/20";

type Props = {
  value: IncomeExpensePayload;
  onChange: (next: IncomeExpensePayload) => void;
  disabled?: boolean;
  employees: { id: string; name: string }[];
  onSubmit?: () => void;
};

export function ExpenseEmployeePayForm({ value, onChange, disabled = false, employees, onSubmit }: Props) {
  const { t } = useI18n();
  const dateRef = useRef<HTMLInputElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const notesRef = useRef<HTMLTextAreaElement>(null);

  const employeeOptions = [
    { value: "", label: t("register.employeePay.selectEmployee") },
    ...employees.map((e) => ({ value: e.id, label: e.name })),
  ];

  const setPatch = (patch: Partial<IncomeExpensePayload>) => {
    const next = normalizeWorkerExpensePayload({ ...value, ...patch });
    onChange(next);
  };

  const syncAmount = (amount: string) => {
    const lines = workerExpenseLines({ ...value, employeePayAmount: amount });
    const payType = value.employeePayType ?? "salary";
    onChange(
      normalizeWorkerExpensePayload({
        ...value,
        employeePayAmount: amount,
        documentType: documentTypeForEmployeePay(payType),
        lines,
        payments: value.payments.map((p, i) => (i === 0 ? { ...p, amount } : p)),
      }),
    );
  };

  const totalToPay = incomeExpenseTotalToPay(
    normalizeWorkerExpensePayload(value),
  );
  const payLabel = documentTypeForEmployeePay(value.employeePayType);

  return (
    <div className="mt-3 space-y-4 rounded-[20px] border border-emerald-200/80 bg-gradient-to-b from-emerald-50/50 via-white to-white p-[18px] shadow-sm">
      <p className="text-[15px] font-black text-emerald-950">{t("register.employeePay.formTitle")}</p>

      <div className="grid gap-3 md:grid-cols-2">
        <label className={labelClass}>
          <span className="flex items-center gap-2">
            <User className="h-4 w-4 text-slate-500" aria-hidden />
            {t("register.employeePay.employee")}
          </span>
          <FloatingSelect
            value={value.employeeId ?? ""}
            onChange={(id) => {
              const hit = employees.find((e) => e.id === id);
              setPatch({
                employeeId: id || null,
                counterpartyName: hit?.name ?? value.counterpartyName,
              });
              requestAnimationFrame(() => dateRef.current?.focus());
            }}
            options={employeeOptions}
            searchable
            disabled={disabled}
            className="mt-1"
          />
        </label>
        <label className={labelClass}>
          <span className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-slate-500" aria-hidden />
            {t("common.date")}
          </span>
          <input
            ref={dateRef}
            type="date"
            value={value.docDate}
            onChange={(e) => setPatch({ docDate: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                amountRef.current?.focus();
              }
            }}
            className={inputClass}
            disabled={disabled}
          />
        </label>
      </div>

      <div>
        <p className={labelClass}>{t("register.employeePay.payType")}</p>
        <div className="mt-2 flex flex-wrap gap-2" role="radiogroup">
          {EMPLOYEE_PAY_TYPE_VALUES.map((pay) => {
            const active = (value.employeePayType ?? "salary") === pay;
            return (
              <button
                key={pay}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={disabled}
                onClick={() =>
                  setPatch({
                    employeePayType: pay as EmployeePayType,
                    documentType: documentTypeForEmployeePay(pay),
                  })
                }
                className={`min-h-[44px] rounded-[16px] border px-4 py-2 text-[13px] font-bold transition ${
                  active
                    ? "border-emerald-700 bg-emerald-700 text-white shadow-md"
                    : "border-slate-200 bg-white text-slate-800 hover:border-emerald-300 hover:bg-emerald-50"
                }`}
              >
                {t(EMPLOYEE_PAY_TYPE_I18N[pay])}
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-[18px] border border-emerald-100 bg-white/90 p-4">
        <label className="block text-center">
          <span className="text-[14px] font-black text-slate-800">{t("register.employeePay.amount")}</span>
          <input
            ref={amountRef}
            type="number"
            min={0}
            step="0.01"
            inputMode="decimal"
            value={value.employeePayAmount ?? ""}
            onChange={(e) => syncAmount(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                notesRef.current?.focus();
              }
            }}
            className={amountClass}
            placeholder="0"
            disabled={disabled}
          />
        </label>
      </div>

      <label className={`block ${labelClass}`}>
        {t("register.employeePay.notes")}
        <textarea
          ref={notesRef}
          value={value.employeePayNotes ?? ""}
          onChange={(e) => setPatch({ employeePayNotes: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSubmit?.();
            }
          }}
          rows={3}
          disabled={disabled}
          className="mt-1 block min-h-[80px] w-full resize-y rounded-[16px] border border-slate-300 bg-white px-3 py-2 text-right text-[15px] text-slate-900 shadow-sm outline-none transition focus:border-luxury-gold focus:ring-2 focus:ring-luxury-gold/25 disabled:opacity-60"
          placeholder={t("register.employeePay.notesPlaceholder")}
        />
        <p className="mt-1 text-[11px] font-semibold text-slate-500">{t("register.employeePay.enterSave")}</p>
      </label>

      <div className="overflow-hidden rounded-[16px] border border-slate-200">
        <table className="w-full text-right text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-2 font-bold text-slate-600">{t("register.employeePay.summaryDesc")}</th>
              <th className="px-4 py-2 font-bold text-slate-600">{t("register.employeePay.summaryAmount")}</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-slate-100 bg-white">
              <td className="px-4 py-3 font-bold text-slate-800">{payLabel}</td>
              <td className="px-4 py-3 text-lg font-black tabular-nums text-slate-900">
                {formatShekel(totalToPay)}
              </td>
            </tr>
            <tr className="border-t border-emerald-100 bg-emerald-50/60">
              <td className="px-4 py-3 font-black text-emerald-900">{t("register.summary.toPay")}</td>
              <td className="px-4 py-3 text-xl font-black tabular-nums text-emerald-800">
                {formatShekel(totalToPay)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
