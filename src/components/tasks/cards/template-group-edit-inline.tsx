"use client";

import { Check, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import type { WorkflowTemplateDetailDto } from "@/lib/workflows/serialize";

const COLOR_PRESETS = ["#2563eb", "#16a34a", "#f59e0b", "#dc2626", "#7c3aed", "#0ea5e9"];

type Props = {
  template: WorkflowTemplateDetailDto;
  onSaved: (updated: WorkflowTemplateDetailDto) => void;
  onCancel: () => void;
};

/** Inline edit for template (group) metadata inside the card. */
export function TemplateGroupEditInline({ template, onSaved, onCancel }: Props) {
  const { t } = useI18n();
  const [title, setTitle] = useState(template.title);
  const [description, setDescription] = useState(template.description ?? "");
  const [color, setColor] = useState(template.color ?? COLOR_PRESETS[0]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setTitle(template.title);
    setDescription(template.description ?? "");
    setColor(template.color ?? COLOR_PRESETS[0]);
  }, [template]);

  const save = async () => {
    const tt = title.trim();
    if (!tt) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/workflows/templates/${encodeURIComponent(template.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: tt,
          description: description.trim() || null,
          color: color.trim() || null,
        }),
        credentials: "same-origin",
      });
      const json = (await res.json().catch(() => null)) as
        | { ok: true; data: WorkflowTemplateDetailDto }
        | { ok: false; error?: string }
        | null;
      if (json?.ok) {
        onSaved(json.data);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="tcg-fade-in mb-2 space-y-2 rounded-xl bg-white/90 p-2.5 ring-1 ring-white/60">
      <p className="text-[10px] font-black uppercase tracking-wide text-slate-600">
        {t("workflows.cards.menuEdit")}
      </p>
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="h-9 w-full rounded-lg px-2 text-xs font-bold ring-1 ring-slate-200"
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={2}
        placeholder={t("workflows.templates.fieldDescription")}
        className="w-full resize-none rounded-lg px-2 py-1.5 text-xs font-semibold ring-1 ring-slate-200"
      />
      <div className="flex flex-wrap gap-1">
        {COLOR_PRESETS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setColor(c)}
            className={`h-7 w-7 rounded-full border-2 ${c === color ? "border-slate-900" : "border-white"}`}
            style={{ background: c }}
            aria-label={c}
          />
        ))}
      </div>
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="flex-1 rounded-lg border border-slate-200 py-2 text-[10px] font-black text-slate-700"
        >
          {t("common.cancel")}
        </button>
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy}
          className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-slate-900 py-2 text-[10px] font-black text-white"
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <Check className="h-3 w-3" aria-hidden />}
          {t("common.save")}
        </button>
      </div>
    </div>
  );
}
