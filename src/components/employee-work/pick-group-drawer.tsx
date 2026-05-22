"use client";

import { Loader2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { fetchJsonCached } from "@/lib/client/fetch-cache";

export type GroupTemplateOption = {
  id: string;
  title: string;
  itemCount: number;
  minutes: number;
  source: "work" | "workflow";
  color?: string | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onPick: (opt: GroupTemplateOption) => void;
  busy?: boolean;
};

export function PickGroupDrawer({ open, onClose, onPick, busy }: Props) {
  const { t, dir } = useI18n();
  const [loading, setLoading] = useState(false);
  const [options, setOptions] = useState<GroupTemplateOption[]>([]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    Promise.all([
      fetchJsonCached<
        { id: string; title: string; tasks: { taskTemplate: { estimatedMinutes: number } }[] }[]
      >("ew-pick:work-templates", "/api/admin/work-templates", 120_000),
      fetchJsonCached<
        {
          id: string;
          title: string;
          color: string | null;
          item_count: number;
          total_minutes: number;
        }[]
      >("ew-pick:wf-templates", "/api/workflows/templates", 120_000),
    ])
      .then(([workData, wfData]) => {
        const work: GroupTemplateOption[] = (workData ?? []).map((tpl) => ({
          id: tpl.id,
          title: tpl.title,
          itemCount: tpl.tasks?.length ?? 0,
          minutes: tpl.tasks?.reduce((s, x) => s + (x.taskTemplate?.estimatedMinutes ?? 0), 0) ?? 0,
          source: "work" as const,
        }));
        const wf: GroupTemplateOption[] = (wfData ?? []).map((tpl) => ({
          id: tpl.id,
          title: tpl.title,
          itemCount: tpl.item_count,
          minutes: tpl.total_minutes,
          source: "workflow" as const,
          color: tpl.color,
        }));
        setOptions([...work, ...wf]);
      })
      .finally(() => setLoading(false));
  }, [open]);

  if (!open) return null;

  return (
    <div
      dir={dir}
      className="fixed inset-0 z-[125] flex items-end justify-center bg-black/50 sm:items-center"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="tcg-fade-in flex max-h-[85vh] w-full max-w-md flex-col rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h3 className="text-base font-black text-slate-950">{t("workflows.employeeWork.pickGroupTitle")}</h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <ul className="flex-1 overflow-y-auto p-3">
          {loading ? (
            <li className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-violet-600" />
            </li>
          ) : options.length === 0 ? (
            <li className="py-6 text-center text-sm font-bold text-slate-500">
              {t("workflows.employeeWork.pickGroupEmpty")}
            </li>
          ) : (
            options.map((opt) => (
              <li key={`${opt.source}-${opt.id}`} className="mb-2">
                <button
                  type="button"
                  disabled={busy || opt.itemCount === 0}
                  onClick={() => onPick(opt)}
                  className="flex w-full flex-col rounded-xl border border-slate-200 bg-gradient-to-br from-violet-50 to-blue-50 p-3 text-start transition hover:scale-[1.01] hover:shadow-md disabled:opacity-50"
                  style={
                    opt.color
                      ? { borderInlineStartWidth: 4, borderInlineStartColor: opt.color }
                      : undefined
                  }
                >
                  <span className="text-sm font-black text-slate-900">{opt.title}</span>
                  <span className="mt-0.5 text-[10px] font-bold text-slate-600">
                    {opt.itemCount} {t("admin.tasks.work.tasksSuffix")} · {opt.minutes}&apos;
                  </span>
                  <span className="mt-1 text-[9px] font-bold uppercase text-violet-700">
                    {opt.source === "work" ? t("workflows.employeeWork.sourceWork") : t("workflows.employeeWork.sourceWorkflow")}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
