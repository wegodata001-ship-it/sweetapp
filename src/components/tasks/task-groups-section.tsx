"use client";

import {
  Calendar,
  CheckCircle2,
  ChevronRight,
  FileText,
  FolderKanban,
  Loader2,
  Plus,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { useToast } from "@/components/toast-provider";
import type { EmployeeOption } from "@/components/tasks/task-group-modal";
import { TaskGroupModal } from "@/components/tasks/task-group-modal";
import type { TaskGroupChangeEvent, TaskGroupSummary } from "@/components/tasks/task-group-types";
import { buildOptimisticGroup } from "@/components/tasks/task-group-types";
import styles from "./task-groups-section.module.css";

export type { TaskGroupChangeEvent, TaskGroupSummary } from "@/components/tasks/task-group-types";

const COLOR_PRESETS = [
  "#10b981",
  "#3b82f6",
  "#f59e0b",
  "#ef4444",
  "#a855f7",
  "#0ea5e9",
  "#64748b",
];

type Props = {
  employees: EmployeeOption[];
  canManage: boolean;
  onGroupsChanged?: () => void;
};

export function TaskGroupsSection({ employees, canManage, onGroupsChanged }: Props) {
  const { t, bcp47 } = useI18n();
  const { showToast } = useToast();
  const [groups, setGroups] = useState<TaskGroupSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [createColor, setCreateColor] = useState(COLOR_PRESETS[0]);
  const [createDueDate, setCreateDueDate] = useState("");
  const [openGroupId, setOpenGroupId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newGroupIds, setNewGroupIds] = useState<Set<string>>(() => new Set());

  const createLockRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!opts?.silent) setLoading(true);
      try {
        const res = await fetch("/api/task-groups", { credentials: "same-origin" });
        const json = (await res.json()) as
          | { ok: true; data: TaskGroupSummary[] }
          | { ok: false; error?: string };
        if (!mountedRef.current) return;
        if (!json.ok) {
          setError(json.error ?? t("taskGroups.section.errLoad"));
          return;
        }
        setGroups(json.data);
        setError(null);
      } catch (e) {
        if (!mountedRef.current) return;
        setError(e instanceof Error ? e.message : t("taskGroups.section.errLoad"));
      } finally {
        if (!opts?.silent && mountedRef.current) setLoading(false);
      }
    },
    [t],
  );

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, [load]);

  const markNew = useCallback((id: string) => {
    setNewGroupIds((prev) => new Set(prev).add(id));
    window.setTimeout(() => {
      setNewGroupIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, 1200);
  }, []);

  const handleCreate = async () => {
    const title = createTitle.trim();
    if (!title) {
      showToast({ tone: "warning", title: t("taskGroups.section.errEmptyTitle") });
      return;
    }
    if (createLockRef.current || creating) return;

    const tempId = `temp-group-${Date.now()}`;
    const optimistic = buildOptimisticGroup(title, createColor, createDueDate, tempId);

    createLockRef.current = true;
    setCreating(true);
    setGroups((prev) => [optimistic, ...prev]);
    markNew(tempId);
    setCreateTitle("");
    setCreateDueDate("");
    setCreateOpen(false);

    try {
      const res = await fetch("/api/task-groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          color: createColor || null,
          dueDate: createDueDate || null,
        }),
        credentials: "same-origin",
      });
      const json = (await res.json()) as
        | { ok: true; data: TaskGroupSummary }
        | { ok: false; error?: string };

      if (!json.ok) {
        setGroups((prev) => prev.filter((g) => g.id !== tempId));
        showToast({
          tone: "error",
          title: t("taskGroups.section.errCreate"),
          description: json.error,
        });
        return;
      }

      setGroups((prev) => prev.map((g) => (g.id === tempId ? json.data : g)));
      markNew(json.data.id);

      showToast({
        tone: "success",
        title: t("taskGroups.section.toastSaved"),
        description: json.data.title,
      });
      onGroupsChanged?.();
    } catch {
      setGroups((prev) => prev.filter((g) => g.id !== tempId));
      showToast({ tone: "error", title: t("taskGroups.section.errCreate") });
    } finally {
      createLockRef.current = false;
      if (mountedRef.current) setCreating(false);
    }
  };

  const handleGroupChange = useCallback(
    (event?: TaskGroupChangeEvent) => {
      if (!event || event.type === "refresh") {
        void load({ silent: true });
        onGroupsChanged?.();
        return;
      }
      if (event.type === "deleted") {
        setGroups((prev) => prev.filter((g) => g.id !== event.id));
        if (openGroupId === event.id) setOpenGroupId(null);
        onGroupsChanged?.();
        return;
      }
      if (event.type === "updated") {
        setGroups((prev) => prev.map((g) => (g.id === event.summary.id ? event.summary : g)));
        onGroupsChanged?.();
      }
    },
    [load, onGroupsChanged, openGroupId],
  );

  const activeGroups = useMemo(
    () => groups.filter((g) => g.status !== "ARCHIVED" && g.status !== "COMPLETED"),
    [groups],
  );
  const completedGroups = useMemo(
    () => groups.filter((g) => g.status === "COMPLETED"),
    [groups],
  );

  return (
    <section className="app-panel p-5 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <FolderKanban className="h-5 w-5 text-emerald-700" aria-hidden />
          <h2 className="text-lg font-black text-slate-950">{t("taskGroups.section.title")}</h2>
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-black text-emerald-900">
            {activeGroups.length}
          </span>
        </div>
        {canManage ? (
          <button
            type="button"
            onClick={() => setCreateOpen((s) => !s)}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3 py-1.5 text-sm font-black text-white shadow-sm transition hover:bg-emerald-700"
          >
            <Plus className="h-4 w-4" aria-hidden />
            {t("taskGroups.section.newGroup")}
          </button>
        ) : null}
      </div>

      {createOpen && canManage ? (
        <form
          className="mt-4 grid gap-2 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-3 sm:grid-cols-[1.4fr_120px_150px_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            void handleCreate();
          }}
        >
          <input
            type="text"
            value={createTitle}
            onChange={(e) => setCreateTitle(e.target.value)}
            placeholder={t("taskGroups.section.titlePlaceholder")}
            disabled={creating}
            className="h-10 rounded-xl border border-emerald-200 bg-white px-3 text-sm font-bold text-slate-900 shadow-sm focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200 disabled:opacity-60"
          />
          <div className="flex items-center gap-1.5">
            {COLOR_PRESETS.map((c) => (
              <button
                key={c}
                type="button"
                disabled={creating}
                onClick={() => setCreateColor(c)}
                aria-label={c}
                className={`h-6 w-6 rounded-full border-2 transition ${
                  c === createColor ? "border-slate-900 ring-2 ring-slate-200" : "border-white"
                }`}
                style={{ background: c }}
              />
            ))}
          </div>
          <input
            type="date"
            value={createDueDate}
            onChange={(e) => setCreateDueDate(e.target.value)}
            disabled={creating}
            className="h-10 rounded-xl border border-emerald-200 bg-white px-3 text-sm font-bold text-slate-900 shadow-sm focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200 disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={creating}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-black text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {creating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                {t("taskGroups.section.saving")}
              </>
            ) : (
              <>
                <Plus className="h-4 w-4" aria-hidden />
                {t("taskGroups.section.createButton")}
              </>
            )}
          </button>
        </form>
      ) : null}

      {error ? (
        <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-900">
          {error}
        </p>
      ) : null}

      <div className="mt-4">
        {loading && groups.length === 0 ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-slate-400" aria-hidden />
          </div>
        ) : activeGroups.length === 0 && completedGroups.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm font-bold text-slate-500">
            {t("taskGroups.section.empty")}
          </p>
        ) : (
          <>
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {activeGroups.map((g) => (
                <GroupCard
                  key={g.id}
                  group={g}
                  bcp47={bcp47}
                  isNew={newGroupIds.has(g.id)}
                  onClick={() => setOpenGroupId(g.id)}
                  tOpenTasks={t("taskGroups.section.openTasks")}
                  tFiles={t("taskGroups.section.files")}
                  tMembers={t("taskGroups.section.members")}
                  tDue={t("taskGroups.section.dueShort")}
                />
              ))}
            </ul>
            {completedGroups.length > 0 ? (
              <details className="group mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <summary className="cursor-pointer text-xs font-black text-slate-700">
                  {t("taskGroups.section.completedToggle", { count: completedGroups.length })}
                </summary>
                <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {completedGroups.map((g) => (
                    <GroupCard
                      key={g.id}
                      group={g}
                      bcp47={bcp47}
                      isNew={false}
                      onClick={() => setOpenGroupId(g.id)}
                      tOpenTasks={t("taskGroups.section.openTasks")}
                      tFiles={t("taskGroups.section.files")}
                      tMembers={t("taskGroups.section.members")}
                      tDue={t("taskGroups.section.dueShort")}
                      compact
                    />
                  ))}
                </ul>
              </details>
            ) : null}
          </>
        )}
      </div>

      <TaskGroupModal
        open={openGroupId !== null}
        groupId={openGroupId}
        employees={employees}
        canManage={canManage}
        onClose={() => setOpenGroupId(null)}
        onChanged={handleGroupChange}
      />
    </section>
  );
}

function GroupCard({
  group,
  bcp47,
  isNew,
  onClick,
  tOpenTasks,
  tFiles,
  tMembers,
  tDue,
  compact = false,
}: {
  group: TaskGroupSummary;
  bcp47: string;
  isNew: boolean;
  onClick: () => void;
  tOpenTasks: string;
  tFiles: string;
  tMembers: string;
  tDue: string;
  compact?: boolean;
}) {
  const dueLabel = group.due_date
    ? new Date(group.due_date).toLocaleDateString(bcp47, {
        day: "2-digit",
        month: "2-digit",
      })
    : null;
  const accent = group.color || "#475569";
  const progress =
    group.task_count > 0
      ? Math.round((group.completed_task_count / group.task_count) * 100)
      : 0;
  const isTemp = group.id.startsWith("temp-");

  return (
    <li className={isNew ? styles.cardEnter : undefined}>
      <button
        type="button"
        onClick={onClick}
        disabled={isTemp}
        className={`${styles.cardBtn} flex w-full flex-col gap-2 rounded-2xl border bg-white p-4 text-left shadow-sm ${
          compact ? "opacity-80" : ""
        } ${isNew ? styles.cardEnterOptimistic : ""} ${isTemp ? "cursor-wait opacity-70" : ""}`}
        style={{ borderColor: `${accent}40` }}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white"
              style={{ background: accent }}
            >
              {isTemp ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <FolderKanban className="h-4 w-4" aria-hidden />
              )}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-black text-slate-950">{group.title}</p>
              {group.description ? (
                <p className="truncate text-xs text-slate-500">{group.description}</p>
              ) : null}
            </div>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
        </div>
        <div className="flex flex-wrap gap-2 text-[11px] font-bold text-slate-600">
          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-emerald-800">
            <CheckCircle2 className="h-3 w-3" aria-hidden />
            {tOpenTasks}: {group.open_task_count}
          </span>
          <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-blue-800">
            <FileText className="h-3 w-3" aria-hidden />
            {tFiles}: {group.file_count}
          </span>
          <span className="inline-flex items-center gap-1 rounded-md bg-violet-50 px-2 py-0.5 text-violet-800">
            <Users className="h-3 w-3" aria-hidden />
            {tMembers}: {group.member_count}
          </span>
          {dueLabel ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-amber-800">
              <Calendar className="h-3 w-3" aria-hidden />
              {tDue}: {dueLabel}
            </span>
          ) : null}
        </div>
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${progress}%`,
              background: progress >= 100 ? "#10b981" : accent,
            }}
          />
        </div>
      </button>
    </li>
  );
}
