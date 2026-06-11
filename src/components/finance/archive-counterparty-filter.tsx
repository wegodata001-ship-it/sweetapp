"use client";

import { useI18n } from "@/components/i18n-provider";
import { ArchiveCounterpartyAutocomplete } from "@/components/finance/archive-counterparty-autocomplete";
import {
  parseArchiveCounterpartyKey,
  type ArchiveCounterpartyKindFilter,
} from "@/lib/finance/counterparty-filter";

type Props = {
  kindFilter: ArchiveCounterpartyKindFilter;
  onKindFilterChange: (kind: ArchiveCounterpartyKindFilter) => void;
  valueKey: string;
  onChange: (key: string) => void;
  className?: string;
};

export function ArchiveCounterpartyFilter({
  kindFilter,
  onKindFilterChange,
  valueKey,
  onChange,
  className,
}: Props) {
  const { t } = useI18n();

  const handleKindChange = (next: ArchiveCounterpartyKindFilter) => {
    onKindFilterChange(next);
    if (valueKey) {
      const parsed = parseArchiveCounterpartyKey(valueKey);
      if (parsed && next && parsed.kind !== next) {
        onChange("");
      }
    }
  };

  return (
    <div className={`flex flex-col gap-2 sm:flex-row sm:items-end ${className ?? ""}`}>
      <label className="w-full shrink-0 sm:w-36">
        <span className="block text-[11px] font-bold text-slate-500">{t("archiveCounterparty.label")}</span>
        <select
          value={kindFilter}
          onChange={(e) => handleKindChange(e.target.value as ArchiveCounterpartyKindFilter)}
          className="mt-1 h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 text-right text-sm font-semibold outline-none focus:border-cyan-600 focus:ring-1 focus:ring-cyan-600/25"
          aria-label={t("archiveCounterparty.label")}
        >
          <option value="">{t("archiveCounterparty.kindAll")}</option>
          <option value="customer">{t("archiveCounterparty.kindCustomers")}</option>
          <option value="supplier">{t("archiveCounterparty.kindSuppliers")}</option>
          <option value="employee">{t("archiveCounterparty.kindEmployees")}</option>
        </select>
      </label>
      <div className="min-w-0 flex-1">
        <ArchiveCounterpartyAutocomplete
          className="sm:mt-0"
          kindFilter={kindFilter}
          valueKey={valueKey}
          onChange={(key) => onChange(key)}
        />
      </div>
    </div>
  );
}
