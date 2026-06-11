"use client";

import { FloatingSelect } from "@/components/ui/floating-select";
import { useI18n } from "@/components/i18n-provider";
import type { ExpenseCounterpartyKind } from "@/lib/finance/counterparty-filter";

type PartyOption = { id: string; name: string };

type Props = {
  kind: ExpenseCounterpartyKind;
  onKindChange: (kind: ExpenseCounterpartyKind) => void;
  partyId: string;
  onPartyIdChange: (id: string) => void;
  suppliers: PartyOption[];
  employees: PartyOption[];
  className?: string;
  selectClassName?: string;
};

export function ExpenseCounterpartyFilter({
  kind,
  onKindChange,
  partyId,
  onPartyIdChange,
  suppliers,
  employees,
  className,
  selectClassName,
}: Props) {
  const { t } = useI18n();

  const partyOptions =
    kind === "supplier"
      ? [
          { value: "", label: t("financeCounterparty.selectSupplier") },
          ...suppliers.map((s) => ({ value: s.id, label: s.name })),
        ]
      : kind === "employee"
        ? [
            { value: "", label: t("financeCounterparty.selectEmployee") },
            ...employees.map((e) => ({ value: e.id, label: e.name })),
          ]
        : [];

  return (
    <div className={`flex flex-wrap items-end gap-2 ${className ?? ""}`}>
      <label className="min-w-[9rem] flex-1">
        <span className="block text-[11px] font-bold text-slate-500">{t("financeCounterparty.kind")}</span>
        <select
          value={kind}
          onChange={(e) => {
            const next = e.target.value as ExpenseCounterpartyKind;
            onKindChange(next);
            onPartyIdChange("");
          }}
          className={
            selectClassName ??
            "mt-1 h-[42px] w-full rounded-lg border border-slate-300 bg-white px-3 text-right text-sm font-semibold outline-none focus:border-cyan-600 focus:ring-1 focus:ring-cyan-600/25"
          }
        >
          <option value="">{t("financeCounterparty.allParties")}</option>
          <option value="supplier">{t("financeCounterparty.supplier")}</option>
          <option value="employee">{t("financeCounterparty.employee")}</option>
        </select>
      </label>
      {kind ? (
        <label className="min-w-[11rem] flex-[1.4]">
          <span className="block text-[11px] font-bold text-slate-500">
            {kind === "supplier"
              ? t("financeCounterparty.supplier")
              : t("financeCounterparty.employee")}
          </span>
          <FloatingSelect
            value={partyId}
            onChange={onPartyIdChange}
            options={partyOptions}
            searchable
            className="mt-1"
          />
        </label>
      ) : null}
    </div>
  );
}
