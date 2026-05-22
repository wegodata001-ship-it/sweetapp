"use client";

import { Calendar, Loader2, Plus, RefreshCw, Search, User, Shield } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { useToast } from "@/components/toast-provider";
import { CardsWorkflowHub } from "@/components/tasks/cards/cards-workflow-hub";
import type { WorkflowEmployeeOption } from "@/components/tasks/cards/workflow-types";
import { EmployeeWorkGroupCard } from "@/components/employee-work/employee-work-group-card";
import { EmployeeWorkTaskCard } from "@/components/employee-work/employee-work-task-card";
import {
  TaskLibraryAutocomplete,
  type LibraryTaskOption,
} from "@/components/employee-work/task-library-autocomplete";
import { EmployeeWorkAdminPanel } from "@/components/employee-work/employee-work-admin-panel";
import { PickGroupDrawer, type GroupTemplateOption } from "@/components/employee-work/pick-group-drawer";
import { getCached, invalidateCacheKey, setCached } from "@/lib/client/fetch-cache";
import { computeDayTaskLocks } from "@/lib/work-tasks/employee-work-lock";
import {
  buildOptimisticTask,
  mergeGroupIntoDay,
  mergeTaskIntoDay,
  patchTaskInDay,
  removeGroupFromDay,
  removeTaskFromDay,
  reorderGroupsInDay,
  reorderTasksInDay,
  replaceTempTaskId,
} from "@/lib/work-tasks/employee-work-optimistic";
import type {
  SerializedEmployeeTask,
  SerializedEmployeeTaskGroup,
  SerializedEmployeeWorkDay,
} from "@/lib/work-tasks/serialize-employee-work";

type EmployeeRow = { id: string; name: string; role?: string; userId?: string };

type HubTab = "work" | "templates";

export function EmployeeWorkHub({
  employees: employeesProp,
  canManage,
  isSuperAdmin = false,
}: {
  employees?: WorkflowEmployeeOption[];
  canManage: boolean;
  isSuperAdmin?: boolean;
}) {
  const { t, dir } = useI18n();
  const { showToast } = useToast();
  const [tab, setTab] = useState<HubTab>("work");
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [empSearch, setEmpSearch] = useState("");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [workDate, setWorkDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [day, setDay] = useState<SerializedEmployeeWorkDay | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);
  const [addTaskOpen, setAddTaskOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newMin, setNewMin] = useState("15");
  const [pickedTemplateId, setPickedTemplateId] = useState<string | undefined>();
  const [dragGroupId, setDragGroupId] = useState<string | null>(null);
  const [dragLooseId, setDragLooseId] = useState<string | null>(null);
  const dayFetchRef = useRef<AbortController | null>(null);
  const loadDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadEmployees = useCallback(async () => {
    const res = await fetch("/api/employees?forWorkOrder=1", { credentials: "same-origin" });
    const j = (await res.json()) as {
      ok?: boolean;
      data?: { id: string; name: string; role?: string; userId?: string }[];
    };
    if (j.data?.length) setEmployees(j.data);
  }, []);

  const loadDay = useCallback(
    async (opts?: { silent?: boolean; force?: boolean }) => {
      if (canManage && !selectedEmployeeId) {
        setDay(null);
        return;
      }
      const cacheKey = `ew:${selectedEmployeeId ?? "me"}:${workDate}`;
      if (!opts?.force) {
        const cached = getCached<SerializedEmployeeWorkDay>(cacheKey);
        if (cached) setDay(cached);
      }

      dayFetchRef.current?.abort();
      const ac = new AbortController();
      dayFetchRef.current = ac;

      if (!opts?.silent) setLoading(true);
      try {
        const url = canManage
          ? `/api/admin/employee-work?employeeId=${encodeURIComponent(selectedEmployeeId!)}&date=${workDate}`
          : `/api/me/employee-work?date=${workDate}`;
        const res = await fetch(url, {
          credentials: "same-origin",
          signal: ac.signal,
        });
        const j = (await res.json()) as {
          ok?: boolean;
          data?: SerializedEmployeeWorkDay;
          error?: string;
        };
        if (!j.ok) {
          showToast({ tone: "error", title: j.error ?? t("common.error") });
          if (!getCached(cacheKey)) setDay(null);
          return;
        }
        if (j.data) {
          setCached(cacheKey, j.data, 45_000);
          setDay(j.data);
        }
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        throw e;
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    },
    [selectedEmployeeId, workDate, canManage, showToast, t],
  );

  useEffect(() => {
    queueMicrotask(() => void loadEmployees());
  }, [loadEmployees]);

  useEffect(() => {
    if (canManage && !selectedEmployeeId && employees.length > 0) {
      setSelectedEmployeeId(employees[0].id);
    }
  }, [canManage, employees, selectedEmployeeId]);

  useEffect(() => {
    if (loadDebounceRef.current) clearTimeout(loadDebounceRef.current);
    loadDebounceRef.current = setTimeout(() => {
      void loadDay({ silent: !!getCached(`ew:${selectedEmployeeId ?? "me"}:${workDate}`) });
    }, 280);
    return () => {
      if (loadDebounceRef.current) clearTimeout(loadDebounceRef.current);
    };
  }, [selectedEmployeeId, workDate, canManage, loadDay]);

  useEffect(() => {
    const applyHash = () => {
      const id = window.location.hash.replace("#", "").trim();
      if (id === "ew-templates" && canManage) setTab("templates");
      if (id === "ew-hub") setTab("work");
    };
    applyHash();
    window.addEventListener("hashchange", applyHash);
    return () => window.removeEventListener("hashchange", applyHash);
  }, [canManage]);

  const filteredEmployees = useMemo(() => {
    const q = empSearch.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter((e) => e.name.toLowerCase().includes(q));
  }, [employees, empSearch]);

  const lockMap = useMemo(
    () => (day ? computeDayTaskLocks(day, canManage) : new Map()),
    [day, canManage],
  );

  const sortedGroups = useMemo(
    () => (day ? [...day.groups].sort((a, b) => a.order_index - b.order_index) : []),
    [day],
  );

  const sortedLoose = useMemo(
    () => (day ? [...day.loose_tasks].sort((a, b) => a.order_index - b.order_index) : []),
    [day],
  );

  const hasAnyTasks =
    (day?.groups.some((g) => g.tasks.length > 0) ?? false) || (day?.loose_tasks.length ?? 0) > 0;

  const postDay = async (body: Record<string, unknown>) => {
    if (!day || !selectedEmployeeId) return;
    const prev = day;
    let optimistic: SerializedEmployeeTask | null = null;

    if (body.kind === "task" || (!body.workTemplateId && !body.workflowTemplateId && body.title)) {
      optimistic = buildOptimisticTask({
        day,
        title: String(body.title ?? ""),
        estimatedMinutes: Number(body.estimatedMinutes) || 15,
        taskGroupId: (body.taskGroupId as string | null) ?? null,
        color: (body.color as string | null) ?? null,
      });
      setDay(mergeTaskIntoDay(day, optimistic));
    }

    try {
      const res = await fetch("/api/admin/employee-work", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, employeeId: selectedEmployeeId, date: workDate }),
        credentials: "same-origin",
      });
      const j = (await res.json()) as {
        ok?: boolean;
        task?: SerializedEmployeeTask;
        group?: SerializedEmployeeTaskGroup;
        error?: string;
      };
      if (!j.ok) {
        setDay(prev);
        showToast({ tone: "error", title: j.error ?? t("common.error") });
        return;
      }
      if (j.task && optimistic) {
        setDay((d) => (d ? replaceTempTaskId(d, optimistic!.id, j.task!) : d));
      } else if (j.group) {
        setDay((d) => (d ? mergeGroupIntoDay(d, j.group!) : d));
      }
      invalidateCacheKey(`ew:${selectedEmployeeId}:${workDate}`);
    } catch {
      setDay(prev);
      showToast({ tone: "error", title: t("common.error") });
    }
  };

  const pickGroup = async (opt: GroupTemplateOption) => {
    setGroupOpen(false);
    setBusy(true);
    try {
      await postDay(
        opt.source === "work"
          ? { kind: "group", workTemplateId: opt.id, color: opt.color }
          : { kind: "group", workflowTemplateId: opt.id, color: opt.color },
      );
      showToast({ tone: "success", title: t("workflows.employeeWork.groupAdded") });
    } finally {
      setBusy(false);
    }
  };

  const addSingleTask = async () => {
    if (!newTitle.trim()) return;
    await postDay({
      kind: "task",
      title: newTitle.trim(),
      estimatedMinutes: Number(newMin) || 15,
      taskTemplateId: pickedTemplateId,
    });
    setNewTitle("");
    setPickedTemplateId(undefined);
    setAddTaskOpen(false);
  };

  const addTaskToGroup = async (
    groupId: string,
    params: { title: string; estimatedMinutes: number; taskTemplateId?: string; color?: string | null },
  ) => {
    await postDay({
      kind: "task",
      taskGroupId: groupId,
      title: params.title,
      estimatedMinutes: params.estimatedMinutes,
      taskTemplateId: params.taskTemplateId,
      color: params.color,
    });
  };

  const saveTask = async (
    taskId: string,
    patch: {
      title: string;
      estimatedMinutes: number;
      description: string;
      materials: string;
      targetDueAt: string;
      color: string | null;
    },
  ) => {
    if (!day) return;
    const prev = day;
    setDay(
      patchTaskInDay(day, taskId, {
        title: patch.title,
        estimated_minutes: patch.estimatedMinutes,
        description: patch.description,
        materials: patch.materials,
        color: patch.color,
        target_due_at: patch.targetDueAt ? `${workDate}T${patch.targetDueAt}:00` : null,
      }),
    );
    try {
      const res = await fetch(`/api/admin/employee-work/tasks/${encodeURIComponent(taskId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: patch.title,
          estimatedMinutes: patch.estimatedMinutes,
          description: patch.description,
          materials: patch.materials,
          targetDueAt: patch.targetDueAt ? `${workDate}T${patch.targetDueAt}:00` : null,
          color: patch.color,
        }),
        credentials: "same-origin",
      });
      const j = (await res.json()) as { ok?: boolean; task?: SerializedEmployeeTask };
      if (!j.ok) {
        setDay(prev);
        showToast({ tone: "error", title: t("common.error") });
      } else if (j.task) {
        setDay((d) => (d ? patchTaskInDay(d, taskId, j.task!) : d));
      }
    } catch {
      setDay(prev);
    }
  };

  const deleteTask = async (taskId: string) => {
    if (!window.confirm(t("workflows.employeeWork.confirmDeleteTask")) || !day) return;
    const prev = day;
    setDay(removeTaskFromDay(day, taskId));
    try {
      const res = await fetch(`/api/admin/employee-work/tasks/${encodeURIComponent(taskId)}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      const j = (await res.json()) as { ok?: boolean };
      if (!j.ok) setDay(prev);
    } catch {
      setDay(prev);
    }
  };

  const reorderTasks = async (orderedIds: string[], groupId: string | null) => {
    if (!day) return;
    const prev = day;
    setDay(reorderTasksInDay(day, groupId, orderedIds));
    try {
      const res = await fetch("/api/admin/employee-work/reorder", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedIds, employeeId: selectedEmployeeId, date: workDate }),
        credentials: "same-origin",
      });
      const j = (await res.json()) as { ok?: boolean };
      if (!j.ok) setDay(prev);
    } catch {
      setDay(prev);
    }
  };

  const reorderGroups = async (targetGroupId: string) => {
    if (!dragGroupId || dragGroupId === targetGroupId || !day) return;
    const ids = sortedGroups.map((g) => g.id);
    const from = ids.indexOf(dragGroupId);
    const to = ids.indexOf(targetGroupId);
    if (from < 0 || to < 0) return;
    ids.splice(from, 1);
    ids.splice(to, 0, dragGroupId);
    const prev = day;
    setDay(reorderGroupsInDay(day, ids));
    setDragGroupId(null);
    try {
      const res = await fetch("/api/admin/employee-work/reorder", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope: "groups",
          orderedGroupIds: ids,
          employeeId: selectedEmployeeId,
          date: workDate,
        }),
        credentials: "same-origin",
      });
      const j = (await res.json()) as { ok?: boolean };
      if (!j.ok) setDay(prev);
    } catch {
      setDay(prev);
    }
  };

  const reorderLooseDrop = async (targetId: string) => {
    if (!dragLooseId || dragLooseId === targetId) return;
    const ids = sortedLoose.map((t) => t.id);
    const from = ids.indexOf(dragLooseId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    ids.splice(from, 1);
    ids.splice(to, 0, dragLooseId);
    await reorderTasks(ids, null);
    setDragLooseId(null);
  };

  const saveGroup = async (groupId: string, patch: { title: string; color: string | null }) => {
    if (!day) return;
    const prev = day;
    setDay({
      ...day,
      groups: day.groups.map((g) =>
        g.id === groupId ? { ...g, title: patch.title, color: patch.color } : g,
      ),
    });
    try {
      const res = await fetch(`/api/admin/employee-work/groups/${encodeURIComponent(groupId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
        credentials: "same-origin",
      });
      const j = (await res.json()) as { ok?: boolean };
      if (!j.ok) setDay(prev);
    } catch {
      setDay(prev);
    }
  };

  const runAdminAction = async (action: string) => {
    if (!selectedEmployeeId && action !== "clean_library") return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/employee-work/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          employeeId: selectedEmployeeId,
          date: workDate,
        }),
        credentials: "same-origin",
      });
      const j = (await res.json()) as {
        ok?: boolean;
        data?: SerializedEmployeeWorkDay;
        meta?: Record<string, unknown>;
        error?: string;
      };
      if (!j.ok) {
        showToast({ tone: "error", title: j.error ?? t("common.error") });
        return;
      }
      if (j.data) {
        setDay(j.data);
        invalidateCacheKey(`ew:${selectedEmployeeId}:${workDate}`);
      }
      showToast({ tone: "success", title: t("workflows.employeeWork.admin.done") });
    } finally {
      setBusy(false);
    }
  };

  const deleteGroup = async (groupId: string) => {
    if (!day) return;
    const prev = day;
    setDay(removeGroupFromDay(day, groupId));
    try {
      const res = await fetch(`/api/admin/employee-work/groups/${encodeURIComponent(groupId)}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      const j = (await res.json()) as { ok?: boolean };
      if (!j.ok) setDay(prev);
    } catch {
      setDay(prev);
    }
  };

  const duplicateGroup = async (groupId: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/employee-work/groups/${encodeURIComponent(groupId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "duplicate", date: workDate }),
        credentials: "same-origin",
      });
      const j = (await res.json()) as { ok?: boolean };
      if (j.ok) await loadDay({ force: true, silent: false });
    } finally {
      setBusy(false);
    }
  };

  const employeeStartComplete = async (taskId: string, action: "start" | "complete") => {
    if (!day) return;
    const prev = day;
    if (action === "start") {
      setDay(
        patchTaskInDay(day, taskId, {
          status: "IN_PROGRESS",
          started_at: new Date().toISOString(),
        }),
      );
    } else {
      setDay(
        patchTaskInDay(day, taskId, {
          status: "COMPLETED",
          completed_at: new Date().toISOString(),
        }),
      );
    }
    try {
      const res = await fetch(`/api/work/tasks/${encodeURIComponent(taskId)}/${action}`, {
        method: "POST",
        credentials: "same-origin",
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!j.ok) {
        setDay(prev);
        showToast({ tone: "error", title: j.error ?? t("common.error") });
      }
    } catch {
      setDay(prev);
      showToast({ tone: "error", title: t("common.error") });
    }
  };

  if (tab === "templates" && canManage) {
    return (
      <div id="ew-templates" dir={dir} className="scroll-mt-4 space-y-3">
        <HubTabs tab={tab} setTab={setTab} canManage={canManage} t={t} />
        <CardsWorkflowHub
          employees={
            employeesProp ??
            employees.map((e) => ({
              id: e.id,
              fullName: e.name,
              email: "",
              role: "EMPLOYEE",
            }))
          }
          canManage={canManage}
        />
      </div>
    );
  }

  return (
    <div id="ew-hub" dir={dir} className="ew-hub tcg-page scroll-mt-4 min-h-0 space-y-3">
      {canManage ? <HubTabs tab={tab} setTab={setTab} canManage={canManage} t={t} /> : null}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-stretch">
        {canManage ? (
          <aside className="flex w-full flex-col rounded-2xl bg-white/90 p-2 shadow-sm ring-1 ring-slate-200/80 lg:w-64 lg:shrink-0">
            <div className="relative mb-2">
              <Search className="pointer-events-none absolute start-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={empSearch}
                onChange={(e) => setEmpSearch(e.target.value)}
                placeholder={t("workflows.employeeWork.searchEmployee")}
                className="h-10 w-full rounded-xl bg-slate-50 ps-9 pe-2 text-sm font-bold ring-1 ring-slate-200"
              />
            </div>
            <ul className="max-h-[50vh] space-y-1 overflow-y-auto lg:max-h-[calc(100vh-220px)]">
              {filteredEmployees.map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedEmployeeId(e.id)}
                    className={`flex w-full items-center gap-2 rounded-xl px-2.5 py-2.5 text-start text-sm font-bold transition ${
                      selectedEmployeeId === e.id
                        ? "bg-violet-600 text-white shadow-md"
                        : "text-slate-800 hover:bg-violet-50"
                    }`}
                  >
                    <User className="h-4 w-4 shrink-0" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{e.name}</span>
                    {e.role && e.role !== "EMPLOYEE" ? (
                      <Shield className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          </aside>
        ) : null}

        <main className="min-w-0 flex-1 rounded-2xl bg-white/90 p-3 shadow-sm ring-1 ring-slate-200/80 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-black text-slate-950">
                {day?.employee_name ?? t("workflows.employeeWork.selectEmployee")}
              </h2>
              <p className="text-xs font-bold text-slate-500">{t("workflows.employeeWork.workOrderSubtitle")}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1 rounded-xl bg-slate-50 px-2 py-1.5 text-xs font-bold ring-1 ring-slate-200">
                <Calendar className="h-4 w-4 text-slate-500" />
                <input
                  type="date"
                  value={workDate}
                  onChange={(e) => setWorkDate(e.target.value)}
                  className="bg-transparent font-bold text-slate-800"
                />
              </label>
              <button
                type="button"
                onClick={() => void loadDay({ force: true })}
                className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          {day ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="rounded-full bg-violet-100 px-2.5 py-1 text-[10px] font-black text-violet-900">
                {t("workflows.employeeWork.statTasks", { n: day.task_count })}
              </span>
              <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-black text-emerald-900">
                {t("workflows.employeeWork.statDone", { n: day.completed_count })}
              </span>
              <span className="rounded-full bg-blue-100 px-2.5 py-1 text-[10px] font-black text-blue-900">
                {t("workflows.employeeWork.statMinutes", { n: day.total_minutes })}
              </span>
            </div>
          ) : null}

          {isSuperAdmin && canManage ? (
            <div className="mt-3">
              <EmployeeWorkAdminPanel
                employeeId={selectedEmployeeId}
                workDate={workDate}
                busy={busy}
                onAction={runAdminAction}
              />
            </div>
          ) : null}

          {canManage && selectedEmployeeId ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setAddTaskOpen((v) => !v)}
                className="inline-flex flex-1 items-center justify-center gap-1 rounded-xl bg-slate-900 px-3 py-2.5 text-xs font-black text-white sm:flex-none"
              >
                <Plus className="h-4 w-4" />
                {t("workflows.employeeWork.addTask")}
              </button>
              <button
                type="button"
                onClick={() => setGroupOpen(true)}
                className="inline-flex flex-1 items-center justify-center gap-1 rounded-xl bg-violet-600 px-3 py-2.5 text-xs font-black text-white sm:flex-none"
              >
                <Plus className="h-4 w-4" />
                {t("workflows.employeeWork.addGroup")}
              </button>
            </div>
          ) : null}

          {addTaskOpen && canManage ? (
            <div className="mt-2 space-y-2 rounded-xl bg-slate-50 p-2 ring-1 ring-slate-200">
              <TaskLibraryAutocomplete
                value={newTitle}
                onChange={setNewTitle}
                onPick={(opt: LibraryTaskOption) => {
                  setNewTitle(opt.title);
                  setNewMin(String(opt.estimatedMinutes));
                  setPickedTemplateId(opt.id);
                }}
              />
              <div className="flex gap-2">
                <input
                  type="number"
                  value={newMin}
                  onChange={(e) => setNewMin(e.target.value)}
                  className="w-20 rounded-lg px-2 py-2 text-sm font-bold"
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void addSingleTask()}
                  className="flex-1 rounded-lg bg-slate-900 px-4 py-2 text-xs font-black text-white"
                >
                  {t("common.save")}
                </button>
              </div>
            </div>
          ) : null}

          {!selectedEmployeeId && canManage ? (
            <p className="mt-8 text-center text-sm font-bold text-slate-500">
              {t("workflows.employeeWork.selectEmployee")}
            </p>
          ) : loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-violet-600" />
            </div>
          ) : day && !hasAnyTasks ? (
            <p className="mt-8 text-center text-sm font-bold text-slate-500">{t("workflows.employeeWork.emptyDay")}</p>
          ) : day ? (
            <div className="mt-3 space-y-3">
              {sortedGroups.map((group) => {
                const hasNext = group.tasks.some((tk) => lockMap.get(tk.id)?.isNext);
                return (
                  <EmployeeWorkGroupCard
                    key={group.id}
                    group={group}
                    canManage={canManage}
                    busy={busy}
                    defaultOpen={canManage ? false : hasNext}
                    lockMap={lockMap}
                    draggableGroup={canManage}
                    onGroupDragStart={() => setDragGroupId(group.id)}
                    onGroupDragOver={(e) => e.preventDefault()}
                    onGroupDrop={() => void reorderGroups(group.id)}
                    onSaveGroup={(patch) => void saveGroup(group.id, patch)}
                    onDeleteGroup={() => void deleteGroup(group.id)}
                    onDuplicateGroup={() => void duplicateGroup(group.id)}
                    onAddTask={(p) => void addTaskToGroup(group.id, p)}
                    onSaveTask={(id, patch) => void saveTask(id, patch)}
                    onDeleteTask={(id) => void deleteTask(id)}
                    onReorderTask={(ids) => void reorderTasks(ids, group.id)}
                    onStartTask={(id) => void employeeStartComplete(id, "start")}
                    onCompleteTask={(id) => void employeeStartComplete(id, "complete")}
                  />
                );
              })}

              {sortedLoose.length > 0 ? (
                <section className="rounded-2xl bg-slate-50/90 p-2 ring-1 ring-slate-200/80">
                  <h3 className="px-2 py-1 text-xs font-black uppercase tracking-wide text-slate-500">
                    {t("workflows.employeeWork.looseSection")}
                  </h3>
                  <ul className="space-y-1.5">
                    {sortedLoose.map((task) => (
                      <EmployeeWorkTaskCard
                        key={task.id}
                        task={task}
                        canManage={canManage}
                        busy={busy}
                        lock={lockMap.get(task.id)}
                        draggable={canManage}
                        onDragStart={() => setDragLooseId(task.id)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => void reorderLooseDrop(task.id)}
                        onSave={(patch) => void saveTask(task.id, patch)}
                        onDelete={() => void deleteTask(task.id)}
                        onStart={
                          !canManage && task.status === "PENDING"
                            ? () => void employeeStartComplete(task.id, "start")
                            : undefined
                        }
                        onComplete={
                          !canManage && task.status === "IN_PROGRESS"
                            ? () => void employeeStartComplete(task.id, "complete")
                            : undefined
                        }
                      />
                    ))}
                  </ul>
                </section>
              ) : null}
            </div>
          ) : null}
        </main>
      </div>

      <PickGroupDrawer open={groupOpen} onClose={() => setGroupOpen(false)} onPick={(o) => void pickGroup(o)} busy={busy} />
    </div>
  );
}

function HubTabs({
  tab,
  setTab,
  canManage,
  t,
}: {
  tab: HubTab;
  setTab: (t: HubTab) => void;
  canManage: boolean;
  t: (k: string) => string;
}) {
  if (!canManage) return null;
  return (
    <div className="flex gap-1 rounded-xl bg-white/80 p-1 shadow-sm ring-1 ring-slate-200/80">
      {(["work", "templates"] as const).map((id) => (
        <button
          key={id}
          type="button"
          onClick={() => {
            setTab(id);
            window.location.hash = id === "templates" ? "ew-templates" : "ew-hub";
          }}
          className={`flex-1 rounded-lg px-3 py-2 text-xs font-black sm:text-sm ${
            tab === id ? "bg-violet-600 text-white shadow" : "text-slate-600"
          }`}
        >
          {id === "work" ? t("workflows.employeeWork.tabWork") : t("workflows.employeeWork.tabTemplates")}
        </button>
      ))}
    </div>
  );
}
