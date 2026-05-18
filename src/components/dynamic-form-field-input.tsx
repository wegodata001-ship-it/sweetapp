"use client";

import { useI18n } from "@/components/i18n-provider";
import type { FormFieldTypeKey } from "@/lib/forms/field-types";
import { parseOptionsJson } from "@/lib/forms/field-types";

export type DynamicFieldDefinition = {
  id: string;
  label: string;
  fieldType: string;
  placeholder?: string | null;
  required: boolean;
  optionsJson?: unknown;
};

type Props = {
  field: DynamicFieldDefinition;
  value: unknown;
  onChange: (next: unknown) => void;
  error?: string | null;
  disabled?: boolean;
};

const baseInput =
  "h-[42px] w-full rounded-lg border border-slate-300 bg-white px-3 text-right text-[14px] font-semibold text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-60";

export function DynamicFormFieldInput({ field, value, onChange, error, disabled }: Props) {
  const { t } = useI18n();
  const id = `dff-${field.id}`;
  const ph = field.placeholder?.trim() || undefined;
  const req = field.required;
  const ft = field.fieldType as FormFieldTypeKey | string;

  const errRing = error ? "border-rose-400 focus:border-rose-500 focus:ring-rose-500/25" : "";

  switch (ft) {
    case "NUMBER":
      return (
        <div className="space-y-1">
          <label htmlFor={id} className="sr-only">
            {field.label}
          </label>
          <input
            id={id}
            type="number"
            required={req}
            placeholder={ph}
            disabled={disabled}
            className={`${baseInput} ${errRing}`}
            value={value === undefined || value === null ? "" : String(value)}
            onChange={(e) => onChange(e.target.value)}
          />
          {error ? <p className="text-xs font-bold text-rose-600">{error}</p> : null}
        </div>
      );

    case "EMAIL":
      return (
        <div className="space-y-1">
          <label htmlFor={id} className="sr-only">
            {field.label}
          </label>
          <input
            id={id}
            type="email"
            inputMode="email"
            autoComplete="email"
            required={req}
            placeholder={ph}
            disabled={disabled}
            className={`${baseInput} ${errRing}`}
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value)}
          />
          {error ? <p className="text-xs font-bold text-rose-600">{error}</p> : null}
        </div>
      );

    case "PHONE":
      return (
        <div className="space-y-1">
          <label htmlFor={id} className="sr-only">
            {field.label}
          </label>
          <input
            id={id}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            required={req}
            placeholder={ph ?? "050-0000000"}
            disabled={disabled}
            className={`${baseInput} ${errRing}`}
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value)}
          />
          {error ? <p className="text-xs font-bold text-rose-600">{error}</p> : null}
        </div>
      );

    case "DATE":
      return (
        <div className="space-y-1">
          <label htmlFor={id} className="sr-only">
            {field.label}
          </label>
          <input
            id={id}
            type="date"
            required={req}
            disabled={disabled}
            className={`${baseInput} ${errRing}`}
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value)}
          />
          {error ? <p className="text-xs font-bold text-rose-600">{error}</p> : null}
        </div>
      );

    case "TIME":
      return (
        <div className="space-y-1">
          <label htmlFor={id} className="sr-only">
            {field.label}
          </label>
          <input
            id={id}
            type="time"
            required={req}
            disabled={disabled}
            className={`${baseInput} ${errRing}`}
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value)}
          />
          {error ? <p className="text-xs font-bold text-rose-600">{error}</p> : null}
        </div>
      );

    case "TEXTAREA":
      return (
        <div className="space-y-1">
          <label htmlFor={id} className="sr-only">
            {field.label}
          </label>
          <textarea
            id={id}
            required={req}
            placeholder={ph}
            disabled={disabled}
            rows={3}
            className={`min-h-[88px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-right text-[14px] font-semibold text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-60 ${errRing}`}
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value)}
          />
          {error ? <p className="text-xs font-bold text-rose-600">{error}</p> : null}
        </div>
      );

    case "SELECT": {
      const opts = parseOptionsJson(field.optionsJson);
      return (
        <div className="space-y-1">
          <label htmlFor={id} className="sr-only">
            {field.label}
          </label>
          <select
            id={id}
            required={req}
            disabled={disabled}
            className={`${baseInput} ${errRing}`}
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value)}
          >
            <option value="">{t("common.selectOption")}</option>
            {opts.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
          {error ? <p className="text-xs font-bold text-rose-600">{error}</p> : null}
        </div>
      );
    }

    case "BOOLEAN":
      return (
        <div className="flex min-h-[42px] items-center gap-3">
          <input
            id={id}
            type="checkbox"
            disabled={disabled}
            className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            checked={Boolean(value)}
            onChange={(e) => onChange(e.target.checked)}
          />
          <label htmlFor={id} className="text-[14px] font-semibold text-slate-800">
            {field.label}
            {req ? <span className="text-rose-600"> *</span> : null}
          </label>
          {error ? <p className="text-xs font-bold text-rose-600">{error}</p> : null}
        </div>
      );

    default:
      return (
        <div className="space-y-1">
          <label htmlFor={id} className="sr-only">
            {field.label}
          </label>
          <input
            id={id}
            type="text"
            required={req}
            placeholder={ph}
            disabled={disabled}
            className={`${baseInput} ${errRing}`}
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value)}
          />
          {error ? <p className="text-xs font-bold text-rose-600">{error}</p> : null}
        </div>
      );
  }
}
