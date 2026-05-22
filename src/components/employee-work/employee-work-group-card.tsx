"use client";

import {
  ChevronDown,
  Copy,
  FolderKanban,
  GripVertical,
  Loader2,
  MoreVertical,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { ConfirmActionModal } from "@/components/employee-work/confirm-action-modal";
import { EmployeeWorkTaskCard } from "@/components/employee-work/employee-work-task-card";
import {
  TaskLibraryAutocomplete,
  type LibraryTaskOption,
} from "@/components/employee-work/task-library-autocomplete";
import { TaskColorPicker } from "@/components/employee-work/task-color-picker";
import type { TaskLockState } from "@/lib/work-tasks/employee-work-lock";
import { groupProgress } from "@/lib/work-tasks/employee-work-lock";
import type {
  SerializedEmployeeTask,
  SerializedEmployeeTaskGroup,
} from "@/lib/work-tasks/serialize-employee-work";

type Props = {
  group: SerializedEmployeeTaskGroup;
  canManage: boolean;
  busy?: boolean;
  defaultOpen?: boolean;
  lockMap: Map<string, TaskLockState>;
  onGroupDragStart?: () => void;
  onGroupDragOver?: (e: React.DragEvent) => void;
  onGroupDrop?: () => void;
  draggableGroup?: boolean;
  onSaveGroup: (patch: { title: string; color: string | null }) => void;
  onDeleteGroup: () => void;
  onDuplicateGroup: () => void;
  onAddTask: (params: {
    title: string;
    estimatedMinutes: number;
    taskTemplateId?: string;
    color?: string | null;
  }) => void;
  onSaveTask: (
    taskId: string,
    patch: {
      title: string;
      estimatedMinutes: number;
      description: string;
      materials: string;
      targetDueAt: string;
      color: string | null;
    },
  ) => void;
  onDeleteTask: (taskId: string) => void;
  onReorderTask: (orderedIds: string[]) => void;
  onStartTask?: (taskId: string) => void;
  onCompleteTask?: (taskId: string) => void;
};

export function EmployeeWorkGroupCard({
  group,
  canManage,
  busy,
  defaultOpen = false,
  lockMap,
  onGroupDragStart,
  onGroupDragOver,
  onGroupDrop,
  draggableGroup,
  onSaveGroup,
  onDeleteGroup,
  onDuplicateGroup,
  onAddTask,
  onSaveTask,
  onDeleteTask,
  onReorderTask,
  onStartTask,
  onCompleteTask,
}: Props) {
  const { t } = useI18n();
  const [open, setOpen] = useState(defaultOpen);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editTitle, setEditTitle] = useState(group.title);
  const [editColor, setEditColor] = useState(group.color);
  const [addOpen, setAddOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newMin, setNewMin] = useState("15");
  const [newColor, setNewColor] = useState<string | null>(null);
  const [pickedTemplateId, setPickedTemplateId] = useState<string | undefined>();
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const prog = groupProgress(group.tasks);
  const accent = group.color ?? "#8b5cf6";

  useEffect(() => {
    setEditTitle(group.title);
    setEditColor(group.color);
  }, [group.title, group.color]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const reorderDrop = (targetId: string) => {
    if (!dragTaskId || dragTaskId === targetId) return;
    const ids = [...group.tasks]
      .sort((a, b) => a.order_index - b.order_index)
      .map((x) => x.id);
    const from = ids.indexOf(dragTaskId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    ids.splice(from, 1);
    ids.splice(to, 0, dragTaskId);
    onReorderTask(ids);
    setDragTaskId(null);
  };

  const submitAdd = () => {
    if (!newTitle.trim()) return;
    onAddTask({
      title: newTitle.trim(),
      estimatedMinutes: Number(newMin) || 15,
      taskTemplateId: pickedTemplateId,
      color: newColor,
    });
    setNewTitle("");
    setNewMin("15");
    setNewColor(null);
    setPickedTemplateId(undefined);
    setAddOpen(false);
    setOpen(true);
  };

  const onLibraryPick = (opt: LibraryTaskOption) => {
    setNewTitle(opt.title);
    setNewMin(String(opt.estimatedMinutes));
    setPickedTemplateId(opt.id);
  };

  return (
    <article
      className="ew-group-card tcg-card-enter overflow-hidden rounded-2xl shadow-md ring-1 ring-slate-200/90"
      style={{
        background: `linear-gradient(135deg, ${accent}18 0%, #ffffff 55%)`,
      }}
      draggable={draggableGroup && canManage}
      onDragStart={onGroupDragStart}
      onDragOver={onGroupDragOver}
      onDrop={onGroupDrop}
    >
      <header className="relative p-3 sm:p-4">
        {canManage ? (
          <span className="absolute start-2 top-1/2 -translate-y-1/2 cursor-grab text-slate-300">
            <GripVertical className="h-5 w-5" aria-hidden />
          </span>
        ) : null}

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={`flex w-full items-start gap-3 text-start ${canManage ? "ps-7" : ""}`}
        >
          <span
            className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-white shadow-inner"
            style={{ backgroundColor: accent }}
          >
            <FolderKanban className="h-6 w-6" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-base font-black text-slate-950 sm:text-lg">{group.title}</h3>
            <p className="mt-0.5 text-xs font-bold text-slate-600">
              {t("workflows.employeeWork.groupMeta", {
                tasks: prog.total,
                minutes: prog.minutes,
                pct: prog.pct,
              })}
            </p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/80 ring-1 ring-slate-200/80">
              <div
                className="ew-progress-bar h-full rounded-full transition-all duration-500"
                style={{ width: `${prog.pct}%`, backgroundColor: accent }}
              />
            </div>
            <p className="mt-1 text-[10px] font-black text-slate-500">
              {t("workflows.employeeWork.groupProgress", { done: prog.done, total: prog.total })}
            </p>
          </div>
          <ChevronDown
            className={`h-6 w-6 shrink-0 text-slate-500 transition-transform duration-300 ${
              open ? "rotate-180" : ""
            }`}
            aria-hidden
          />
        </button>

        {canManage ? (
          <div ref={menuRef} className="absolute end-2 top-2">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="grid h-9 w-9 place-items-center rounded-xl bg-white/90 shadow-sm ring-1 ring-slate-200"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
            {menuOpen ? (
              <ul className="absolute end-0 z-20 mt-1 min-w-[10rem] rounded-xl bg-white py-1 text-xs font-bold shadow-lg ring-1 ring-slate-200">
                <li>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-2 hover:bg-slate-50"
                    onClick={() => {
                      setMenuOpen(false);
                      setOpen(true);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    {t("common.edit")}
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-2 hover:bg-slate-50"
                    onClick={() => {
                      setMenuOpen(false);
                      onDuplicateGroup();
                    }}
                  >
                    <Copy className="h-3.5 w-3.5" />
                    {t("workflows.cards.menuDuplicate")}
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-2 text-rose-700 hover:bg-rose-50"
                    onClick={() => {
                      setMenuOpen(false);
                      setDeleteOpen(true);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {t("workflows.employeeWork.deleteGroup")}
                  </button>
                </li>
              </ul>
            ) : null}
          </div>
        ) : null}
      </header>

      <div
        className={`ew-accordion-grid ${open ? "ew-accordion-open" : ""}`}
      >
        <div className="ew-accordion-inner border-t border-white/60 bg-white/50 px-2 pb-3 pt-1 sm:px-3">
          {canManage ? (
            <div className="mb-2 rounded-xl bg-white/90 p-2 ring-1 ring-slate-200/80">
              <input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="mb-1 h-9 w-full rounded-lg bg-slate-50 px-2 text-sm font-bold ring-1 ring-slate-200"
              />
              <TaskColorPicker value={editColor} onChange={setEditColor} compact />
              <button
                type="button"
                disabled={busy}
                onClick={() => onSaveGroup({ title: editTitle, color: editColor })}
                className="mt-2 flex h-9 w-full items-center justify-center rounded-lg bg-slate-900 text-xs font-black text-white"
              >
                {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : t("common.save")}
              </button>
            </div>
          ) : null}

          <ul className="space-y-1.5 ps-1 sm:ps-2">
            {[...group.tasks]
              .sort((a, b) => a.order_index - b.order_index)
              .map((task) => (
                <EmployeeWorkTaskCard
                  key={task.id}
                  task={task}
                  canManage={canManage}
                  busy={busy}
                  nested
                  lock={lockMap.get(task.id)}
                  draggable={canManage}
                  onDragStart={() => setDragTaskId(task.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => reorderDrop(task.id)}
                  onSave={(patch) =>
                    onSaveTask(task.id, { ...patch, color: patch.color ?? task.color })
                  }
                  onDelete={() => onDeleteTask(task.id)}
                  onStart={
                    !canManage && task.status === "PENDING"
                      ? () => onStartTask?.(task.id)
                      : undefined
                  }
                  onComplete={
                    !canManage && task.status === "IN_PROGRESS"
                      ? () => onCompleteTask?.(task.id)
                      : undefined
                  }
                />
              ))}
          </ul>

          {canManage ? (
            <div className="mt-2">
              {addOpen ? (
                <div className="space-y-2 rounded-xl bg-white p-2 ring-1 ring-slate-200">
                  <TaskLibraryAutocomplete
                    value={newTitle}
                    onChange={setNewTitle}
                    onPick={onLibraryPick}
                  />
                  <div className="flex gap-2">
                    <input
                      type="number"
                      min={0}
                      value={newMin}
                      onChange={(e) => setNewMin(e.target.value)}
                      className="h-10 w-20 rounded-lg bg-slate-50 px-2 text-sm font-bold ring-1 ring-slate-200"
                    />
                    <button
                      type="button"
                      disabled={busy}
                      onClick={submitAdd}
                      className="flex flex-1 items-center justify-center rounded-lg bg-violet-600 text-xs font-black text-white"
                    >
                      {t("common.save")}
                    </button>
                  </div>
                  <TaskColorPicker value={newColor} onChange={setNewColor} />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setAddOpen(true)}
                  className="flex h-11 w-full items-center justify-center gap-1 rounded-xl border-2 border-dashed border-violet-200 text-xs font-black text-violet-800"
                >
                  <Plus className="h-4 w-4" />
                  {t("workflows.employeeWork.addTaskInGroup")}
                </button>
              )}
            </div>
          ) : null}
        </div>
      </div>

      <ConfirmActionModal
        open={deleteOpen}
        title={t("workflows.employeeWork.deleteGroupTitle")}
        body={t("workflows.employeeWork.deleteGroupBody", { name: group.title })}
        hint={t("workflows.employeeWork.deleteGroupHint")}
        confirmLabel={t("common.delete")}
        busy={busy}
        tone="danger"
        icon={Trash2}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={() => {
          setDeleteOpen(false);
          onDeleteGroup();
        }}
      />
    </article>
  );
}
