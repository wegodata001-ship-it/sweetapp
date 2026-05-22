"use client";

import { Loader2, Plus, X } from "lucide-react";
import { useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import type { WorkflowEmployeeOption } from "@/components/tasks/cards/workflow-types";
import type { WorkflowTaskDto } from "@/lib/workflows/serialize";

export type InlineTaskCreatePayload = {
  title: string;
  estimatedMinutes: number;
  notes: string;
  targetTime: string;
  assigneeId: string;
  /** Pick existing library task instead of creating new */
  libraryTaskId?: string;
};

type Props = {
  open: boolean;
  onToggle: () => void;
  onSubmit: (payload: InlineTaskCreatePayload) => Promise<boolean>;
  libraryTasks?: WorkflowTaskDto[];
  employees?: WorkflowEmployeeOption[];
  showAssignee?: boolean;
  showLibraryPick?: boolean;
  busy?: boolean;
};

/**
 * Inline expand form inside a group card — no modal, no page navigation.
 */
export function InlineTaskCreator({
  open,
  onToggle,
  onSubmit,
  libraryTasks = [],
  employees = [],
  showAssignee = false,
  showLibraryPick = true,
  busy = false,
}: Props) {
  const { t } = useI18n();
  const [title, setTitle] = useState("");
  const [minutes, setMinutes] = useState("10");
  const [notes, setNotes] = useState("");
  const [targetTime, setTargetTime] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [libraryTaskId, setLibraryTaskId] = useState("");
  const [mode, setMode] = useState<"new" | "library">("new");

  const reset = () => {
    setTitle("");
    setMinutes("10");
    setNotes("");
    setTargetTime("");
    setAssigneeId("");
    setLibraryTaskId("");
    setMode("new");
  };

  const handleSave = async () => {
    const n = Number(minutes);
    if (mode === "new" && !title.trim()) return;
    if (mode === "library" && !libraryTaskId) return;
    const ok = await onSubmit({
      title: title.trim(),
      estimatedMinutes: Number.isFinite(n) ? n : 10,
      notes: notes.trim(),
      targetTime: targetTime.trim(),
      assigneeId: assigneeId.trim(),
      libraryTaskId: mode === "library" ? libraryTaskId : undefined,
    });
    if (ok) {
      reset();
      onToggle();
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-white/80 py-2.5 text-xs font-black text-slate-800 shadow-sm transition hover:scale-[1.02] hover:bg-white active:scale-[0.98]"
      >
        <Plus className="h-4 w-4" aria-hidden />
        {t("workflows.cards.addTask")}
      </button>
    );
  }

  return (
    <div className="tcg-fade-in space-y-2 rounded-xl bg-white/90 p-2.5 shadow-inner ring-1 ring-white/60">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-black uppercase tracking-wide text-slate-600">
          {t("workflows.cards.newTaskInline")}
        </p>
        <button
          type="button"
          onClick={() => {
            reset();
            onToggle();
          }}
          className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"
          aria-label={t("common.cancel")}
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>

      {showLibraryPick && libraryTasks.length > 0 ? (
        <div className="flex gap-1 rounded-lg bg-slate-100 p-0.5">
          <button
            type="button"
            onClick={() => setMode("new")}
            className={`flex-1 rounded-md py-1 text-[10px] font-black transition ${
              mode === "new" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"
            }`}
          >
            {t("workflows.cards.modeNew")}
          </button>
          <button
            type="button"
            onClick={() => setMode("library")}
            className={`flex-1 rounded-md py-1 text-[10px] font-black transition ${
              mode === "library" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"
            }`}
          >
            {t("workflows.cards.modeLibrary")}
          </button>
        </div>
      ) : null}

      {mode === "library" ? (
        <select
          value={libraryTaskId}
          onChange={(e) => setLibraryTaskId(e.target.value)}
          className="h-9 w-full rounded-lg border-0 bg-white px-2 text-xs font-bold text-slate-900 shadow-sm ring-1 ring-slate-200 focus:ring-2 focus:ring-blue-300"
        >
          <option value="">{t("workflows.templates.pickFromLibrary")}</option>
          {libraryTasks
            .filter((tt) => !tt.archived_at)
            .map((tt) => (
              <option key={tt.id} value={tt.id}>
                {tt.title} · {tt.estimated_minutes}&apos;
              </option>
            ))}
        </select>
      ) : (
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("workflows.cards.taskNamePh")}
          className="h-9 w-full rounded-lg border-0 bg-white px-2 text-xs font-bold text-slate-900 shadow-sm ring-1 ring-slate-200 focus:ring-2 focus:ring-blue-300"
        />
      )}

      <div className="grid grid-cols-2 gap-1.5">
        <label className="block">
          <span className="text-[9px] font-bold text-slate-500">{t("workflows.page.minutesLabel")}</span>
          <input
            type="number"
            min={0}
            max={480}
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            disabled={mode === "library"}
            className="mt-0.5 h-8 w-full rounded-lg border-0 bg-white px-2 text-xs font-bold tabular-nums shadow-sm ring-1 ring-slate-200 disabled:opacity-60"
          />
        </label>
        <label className="block">
          <span className="text-[9px] font-bold text-slate-500">{t("workflows.cards.targetTime")}</span>
          <input
            type="time"
            value={targetTime}
            onChange={(e) => setTargetTime(e.target.value)}
            className="mt-0.5 h-8 w-full rounded-lg border-0 bg-white px-2 text-xs font-bold shadow-sm ring-1 ring-slate-200"
          />
        </label>
      </div>

      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={2}
        placeholder={t("workflows.cards.notesPh")}
        className="w-full resize-none rounded-lg border-0 bg-white px-2 py-1.5 text-xs font-semibold text-slate-800 shadow-sm ring-1 ring-slate-200 focus:ring-2 focus:ring-blue-300"
      />

      {showAssignee && employees.length > 0 ? (
        <select
          value={assigneeId}
          onChange={(e) => setAssigneeId(e.target.value)}
          className="h-9 w-full rounded-lg border-0 bg-white px-2 text-xs font-bold text-slate-900 shadow-sm ring-1 ring-slate-200"
        >
          <option value="">{t("workflows.launcher.pickAssignee")}</option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.fullName}
            </option>
          ))}
        </select>
      ) : null}

      <button
        type="button"
        onClick={() => void handleSave()}
        disabled={busy}
        className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 text-xs font-black text-white shadow-md transition hover:bg-slate-800 disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
        {t("common.save")}
      </button>
    </div>
  );
}
