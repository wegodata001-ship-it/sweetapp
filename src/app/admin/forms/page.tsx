"use client";

import { ClipboardList, LayoutGrid, Trash2 } from "lucide-react";
import Link from "next/link";
import type { Dispatch, SetStateAction } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DynamicFormFieldInput, type DynamicFieldDefinition } from "@/components/dynamic-form-field-input";
import {
  FORM_FIELD_TYPE_KEYS,
  FORM_FIELD_TYPE_LABELS,
  optionsJsonToText,
  parseOptionsJson,
  validateDynamicFieldValue,
  type FormFieldTypeKey,
} from "@/lib/forms/field-types";
import { useI18n } from "@/components/i18n-provider";

type ApiField = {
  id: string;
  label: string;
  fieldType: string;
  placeholder: string | null;
  required: boolean;
  optionsJson: unknown;
  sortOrder: number;
};

type Draft = {
  label: string;
  fieldType: FormFieldTypeKey;
  placeholder: string;
  required: boolean;
  optionsText: string;
};

const emptyDraft = (): Draft => ({
  label: "",
  fieldType: "STRING",
  placeholder: "",
  required: false,
  optionsText: "",
});

const cellInput =
  "h-[42px] w-full rounded-lg border border-slate-300 bg-white px-3 text-right text-[14px] font-semibold text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/25";

const rowClass = "min-h-[58px] items-center gap-2 border-b border-slate-100 py-2 last:border-b-0";

function toDynamicDef(f: ApiField): DynamicFieldDefinition {
  return {
    id: f.id,
    label: f.label,
    fieldType: f.fieldType,
    placeholder: f.placeholder,
    required: f.required,
    optionsJson: f.optionsJson,
  };
}

export default function AdminFormsPage() {
  const { t } = useI18n();
  const [fields, setFields] = useState<ApiField[]>([]);
  const [newDraft, setNewDraft] = useState<Draft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Draft>(emptyDraft);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [previewValues, setPreviewValues] = useState<Record<string, unknown>>({});
  const [previewErrors, setPreviewErrors] = useState<Record<string, string>>({});

  const loadFields = useCallback(async () => {
    setLoadError(null);
    try {
      const fRes = await fetch("/api/form-fields", { credentials: "same-origin" });
      if (fRes.status === 503) {
        setLoadError(t("admin.forms.errors.noDb"));
        return;
      }
      const fj = (await fRes.json()) as { data?: ApiField[] };
      if (fj.data) {
        setFields(fj.data);
        setPreviewValues({});
        setPreviewErrors({});
      }
    } catch {
      setLoadError(t("admin.forms.errors.loadFailed"));
    }
  }, [t]);

  useEffect(() => {
    void loadFields();
  }, [loadFields]);

  const sortedFields = useMemo(
    () => [...fields].sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, "he")),
    [fields],
  );

  const addField = async () => {
    if (!newDraft.label.trim()) return;
    const res = await fetch("/api/form-fields", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        label: newDraft.label.trim(),
        fieldType: newDraft.fieldType,
        placeholder: newDraft.placeholder.trim() || null,
        required: newDraft.required,
        sortOrder: fields.length,
        ...(newDraft.fieldType === "SELECT" ? { optionsText: newDraft.optionsText } : {}),
      }),
      credentials: "same-origin",
    });
    if (!res.ok) return;
    const j = (await res.json()) as { data?: ApiField };
    if (j.data) setFields((prev) => [...prev, j.data!]);
    setNewDraft(emptyDraft());
  };

  const removeField = async (id: string) => {
    await fetch(`/api/form-fields/${encodeURIComponent(id)}`, {
      method: "DELETE",
      credentials: "same-origin",
    });
    setFields((prev) => prev.filter((f) => f.id !== id));
    if (editingId === id) {
      setEditingId(null);
      setEditDraft(emptyDraft());
    }
    setPreviewValues((pv) => {
      const next = { ...pv };
      delete next[id];
      return next;
    });
  };

  const startEditField = (field: ApiField) => {
    setEditingId(field.id);
    setEditDraft({
      label: field.label,
      fieldType: (FORM_FIELD_TYPE_KEYS as readonly string[]).includes(field.fieldType)
        ? (field.fieldType as FormFieldTypeKey)
        : "STRING",
      placeholder: field.placeholder ?? "",
      required: field.required,
      optionsText: optionsJsonToText(field.optionsJson),
    });
  };

  const saveFieldEdit = async () => {
    if (!editingId || !editDraft.label.trim()) return;
    const res = await fetch(`/api/form-fields/${encodeURIComponent(editingId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        label: editDraft.label.trim(),
        fieldType: editDraft.fieldType,
        placeholder: editDraft.placeholder.trim() || null,
        required: editDraft.required,
        ...(editDraft.fieldType === "SELECT" ? { optionsText: editDraft.optionsText } : {}),
      }),
      credentials: "same-origin",
    });
    if (!res.ok) return;
    const j = (await res.json()) as { data?: ApiField };
    if (j.data) {
      setFields((prev) => prev.map((f) => (f.id === editingId ? j.data! : f)));
    }
    setEditingId(null);
    setEditDraft(emptyDraft());
  };

  const runPreviewValidate = () => {
    const nextErr: Record<string, string> = {};
    for (const f of sortedFields) {
      const opts = parseOptionsJson(f.optionsJson);
      const msg = validateDynamicFieldValue(f.fieldType, previewValues[f.id], f.required, opts);
      if (msg) nextErr[f.id] = msg;
    }
    setPreviewErrors(nextErr);
  };

  const renderDraftRow = (
    draft: Draft,
    setDraft: Dispatch<SetStateAction<Draft>>,
    onSubmit: () => void | Promise<void>,
    submitLabel: string,
    showCancel?: () => void,
  ) => (
    <div className="space-y-3">
      <div className={`grid grid-cols-1 gap-2 md:grid-cols-12 md:gap-x-3 ${rowClass}`}>
        <div className="md:col-span-3">
          <label className="mb-1 block text-[11px] font-bold text-slate-500">{t("admin.forms.builder.labelFieldName")}</label>
          <input
            value={draft.label}
            onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
            className={cellInput}
            placeholder={t("admin.forms.builder.placeholderFieldName")}
          />
        </div>
        <div className="md:col-span-2">
          <label className="mb-1 block text-[11px] font-bold text-slate-500">{t("admin.forms.fields.type")}</label>
          <select
            value={draft.fieldType}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                fieldType: e.target.value as FormFieldTypeKey,
              }))
            }
            className={cellInput}
          >
            {FORM_FIELD_TYPE_KEYS.map((k) => (
              <option key={k} value={k}>
                {FORM_FIELD_TYPE_LABELS[k]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col justify-end md:col-span-2">
          <label className="mb-1 flex cursor-pointer items-center gap-2 text-[13px] font-bold text-slate-800">
            <input
              type="checkbox"
              checked={draft.required}
              onChange={(e) => setDraft((d) => ({ ...d, required: e.target.checked }))}
              className="h-4 w-4 rounded border-slate-300"
            />
            {t("admin.forms.fields.required")}
          </label>
        </div>
        <div className="md:col-span-4">
          <label className="mb-1 block text-[11px] font-bold text-slate-500">{t("admin.forms.builder.labelPlaceholder")}</label>
          <input
            value={draft.placeholder}
            onChange={(e) => setDraft((d) => ({ ...d, placeholder: e.target.value }))}
            className={cellInput}
            placeholder={t("admin.forms.builder.placeholderExamplePhone")}
          />
        </div>
        <div className="flex flex-wrap items-end gap-2 md:col-span-1 md:justify-end">
          <button
            type="button"
            onClick={() => void onSubmit()}
            className="h-[42px] rounded-lg bg-indigo-600 px-4 text-[13px] font-black text-white hover:bg-indigo-700"
          >
            {submitLabel}
          </button>
          {showCancel ? (
            <button
              type="button"
              onClick={showCancel}
              className="h-[42px] rounded-lg border border-slate-300 px-3 text-[13px] font-bold text-slate-700 hover:bg-slate-50"
            >
              {t("common.cancel")}
            </button>
          ) : null}
        </div>
      </div>
      {draft.fieldType === "SELECT" ? (
        <div>
          <label className="mb-1 block text-[11px] font-bold text-slate-500">{t("admin.forms.builder.labelOptions")}</label>
          <textarea
            value={draft.optionsText}
            onChange={(e) => setDraft((d) => ({ ...d, optionsText: e.target.value }))}
            rows={3}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-right text-[14px] font-semibold text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/25"
            placeholder={t("admin.forms.builder.placeholderOptions")}
          />
        </div>
      ) : null}
    </div>
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <section className="app-panel p-8">
        <p className="flex items-center gap-2 text-sm font-bold tracking-[0.12em] text-violet-700">
          <ClipboardList className="h-4 w-4" aria-hidden />
          {t("admin.forms.kicker")}
        </p>
        <h1 className="mt-3 text-3xl font-black text-slate-950">{t("admin.forms.pageTitle")}</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          {t("admin.forms.pageSubtitle")}
        </p>
        <Link
          href="/admin/tasks"
          className="mt-4 inline-flex text-sm font-bold text-cyan-700 underline underline-offset-2 hover:text-cyan-900"
        >
          {t("admin.forms.linkBackToTasks")}
        </Link>
        {loadError ? (
          <p className="mt-4 text-sm font-bold text-amber-800" role="alert">
            {loadError}
          </p>
        ) : null}
      </section>

      <section className="app-panel p-6 md:p-8">
        <div className="flex flex-wrap items-center gap-2">
          <LayoutGrid className="h-5 w-5 text-indigo-600" aria-hidden />
          <h2 className="text-xl font-black text-slate-950">{t("admin.forms.builder.heading")}</h2>
        </div>
        <p className="mt-2 text-sm text-slate-600">
          {t("admin.forms.builder.help")}
        </p>

        <div className="mt-6 rounded-2xl border border-indigo-200/80 bg-indigo-50/40 p-4 md:p-5">
          <p className="mb-3 text-[13px] font-black text-indigo-950">{t("admin.forms.builder.addNew")}</p>
          {renderDraftRow(newDraft, setNewDraft, addField, t("admin.forms.builder.addBtn"))}
        </div>

        <div className="mt-8 overflow-hidden rounded-2xl border border-slate-200">
          <div className="hidden grid-cols-12 gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-black text-slate-600 md:grid">
            <div className="col-span-3">{t("admin.forms.builder.labelFieldName")}</div>
            <div className="col-span-2">{t("admin.forms.builder.thType")}</div>
            <div className="col-span-2">{t("admin.forms.fields.required")}</div>
            <div className="col-span-4">{t("admin.forms.builder.labelPlaceholder")}</div>
            <div className="col-span-1 text-end">{t("common.actions")}</div>
          </div>
          <div className="divide-y divide-slate-100">
            {sortedFields.map((field) => {
              const isEditing = editingId === field.id;
              return (
                <div key={field.id} className="px-3 py-3">
                  {isEditing ? (
                    renderDraftRow(editDraft, setEditDraft, saveFieldEdit, t("common.save"), () => {
                      setEditingId(null);
                      setEditDraft(emptyDraft());
                    })
                  ) : (
                    <div className={`grid grid-cols-1 gap-2 md:grid-cols-12 md:gap-x-3 ${rowClass}`}>
                      <div className="font-bold text-slate-900 md:col-span-3">{field.label}</div>
                      <div className="text-[13px] text-slate-700 md:col-span-2">
                        {(FORM_FIELD_TYPE_KEYS as readonly string[]).includes(field.fieldType)
                          ? FORM_FIELD_TYPE_LABELS[field.fieldType as FormFieldTypeKey]
                          : field.fieldType}
                      </div>
                      <div className="text-[13px] md:col-span-2">{field.required ? t("common.yes") : t("common.no")}</div>
                      <div className="truncate text-[13px] text-slate-600 md:col-span-4">{field.placeholder ?? "—"}</div>
                      <div className="flex flex-wrap gap-2 md:col-span-1 md:justify-end">
                        <button
                          type="button"
                          onClick={() => startEditField(field)}
                          className="rounded-lg border border-indigo-300 px-3 py-2 text-[12px] font-black text-indigo-700 hover:bg-indigo-50"
                        >
                          {t("common.edit")}
                        </button>
                        <button
                          type="button"
                          onClick={() => void removeField(field.id)}
                          className="inline-flex items-center gap-1 rounded-lg border border-rose-300 px-3 py-2 text-[12px] font-black text-rose-700 hover:bg-rose-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                          {t("common.delete")}
                        </button>
                      </div>
                    </div>
                  )}
                  {!isEditing && field.fieldType === "SELECT" ? (
                    <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-slate-50 px-3 py-2 text-[12px] text-slate-600">
                      {optionsJsonToText(field.optionsJson) || "—"}
                    </pre>
                  ) : null}
                </div>
              );
            })}
          </div>
          {sortedFields.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm font-semibold text-slate-500">{t("admin.forms.builder.emptyNote")}</p>
          ) : null}
        </div>
      </section>

      <section className="app-panel p-6 md:p-8">
        <h2 className="text-lg font-black text-slate-950">{t("admin.forms.preview.heading")}</h2>
        <p className="mt-1 text-sm text-slate-600">
          {t("admin.forms.preview.help")}
        </p>
        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {sortedFields.map((field) => {
            const def = toDynamicDef(field);
            const showLabel = field.fieldType !== "BOOLEAN";
            return (
              <div key={field.id} className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                {showLabel ? (
                  <label className="mb-2 block text-[13px] font-black text-slate-900">
                    {field.label}
                    {field.required ? <span className="text-rose-600"> *</span> : null}
                  </label>
                ) : null}
                <DynamicFormFieldInput
                  field={
                    showLabel
                      ? { ...def, label: "\u200b" }
                      : def
                  }
                  value={previewValues[field.id]}
                  onChange={(v) =>
                    setPreviewValues((pv) => ({
                      ...pv,
                      [field.id]: v,
                    }))
                  }
                  error={previewErrors[field.id]}
                />
              </div>
            );
          })}
        </div>
        {sortedFields.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">{t("admin.forms.preview.empty")}</p>
        ) : (
          <button
            type="button"
            onClick={runPreviewValidate}
            className="mt-6 rounded-xl bg-slate-900 px-5 py-3 text-sm font-black text-white hover:bg-slate-800"
          >
            {t("admin.forms.preview.validateBtn")}
          </button>
        )}
      </section>
    </div>
  );
}
