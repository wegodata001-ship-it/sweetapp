"use client";

/**
 * Cards Workflow UI — replaces the ERP-style tabs/tables layout for
 * `/admin/workflows` (משימות לעובדים). All API + permission rules unchanged.
 */

import {
  AlertTriangle,
  Check,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchJsonCached, invalidateCacheKey, setCached } from "@/lib/client/fetch-cache";
import { useAuth } from "@/components/auth-provider";
import { useI18n } from "@/components/i18n-provider";
import { useToast } from "@/components/toast-provider";
import type {
  WorkflowRunDetailDto,
  WorkflowRunItemDto,
  WorkflowRunSummaryDto,
  WorkflowTaskDto,
  WorkflowTemplateDetailDto,
  WorkflowTemplateSummaryDto,
} from "@/lib/workflows/serialize";
import { InlineTaskCreator, type InlineTaskCreatePayload } from "./inline-task-creator";
import { MobileTaskGrid } from "./mobile-task-grid";
import { TaskGroupCard, TaskGroupCardFooterAction } from "./task-group-card";
import { TaskGroupCardMenu, type TaskGroupMenuAction } from "./task-group-card-menu";
import { TaskGroupDeleteModal } from "./task-group-delete-modal";
import { TaskMiniCard } from "./task-mini-card";
import { TemplateGroupEditInline } from "./template-group-edit-inline";
import type { WorkflowEmployeeOption } from "./workflow-types";

const COLOR_PRESETS = ["#2563eb", "#16a34a", "#f59e0b", "#dc2626", "#7c3aed", "#0ea5e9"];

type WorkflowDashboard = {
  active_runs: number;
  completed_today: number;
  runs_with_lates_today: number;
};

type ExpandedKey = string | null;

function cardKey(kind: "tpl" | "run", id: string) {
  return `${kind}:${id}`;
}

function parseKey(key: ExpandedKey): { kind: "tpl" | "run"; id: string } | null {
  if (!key) return null;
  const [kind, id] = key.split(":");
  if ((kind === "tpl" || kind === "run") && id) return { kind, id };
  return null;
}

export function CardsWorkflowHub({
  employees,
  canManage,
  hideHeader = false,
}: {
  employees: WorkflowEmployeeOption[];
  canManage: boolean;
  /** Employee portal embeds its own title */
  hideHeader?: boolean;
}) {
  const { t, dir } = useI18n();
  const { user } = useAuth();
  const { showToast } = useToast();

  const [now, setNow] = useState(() => Date.now());
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<WorkflowTemplateSummaryDto[]>([]);
  const [tasks, setTasks] = useState<WorkflowTaskDto[]>([]);
  const [activeRuns, setActiveRuns] = useState<WorkflowRunSummaryDto[]>([]);
  const [recentRuns, setRecentRuns] = useState<WorkflowRunSummaryDto[]>([]);
  const [dash, setDash] = useState<WorkflowDashboard | null>(null);

  const [expanded, setExpanded] = useState<ExpandedKey>(null);
  const [tplDetails, setTplDetails] = useState<Record<string, WorkflowTemplateDetailDto>>({});
  const [runDetails, setRunDetails] = useState<Record<string, WorkflowRunDetailDto>>({});
  const [detailLoading, setDetailLoading] = useState<string | null>(null);
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const [busyGroup, setBusyGroup] = useState(false);

  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [newGroupTitle, setNewGroupTitle] = useState("");
  const [newGroupColor, setNewGroupColor] = useState(COLOR_PRESETS[0]);
  const [creatingGroup, setCreatingGroup] = useState(false);

  const [addTaskOpen, setAddTaskOpen] = useState<Record<string, boolean>>({});
  const [launchOpen, setLaunchOpen] = useState<Record<string, boolean>>({});
  const [launchAssignee, setLaunchAssignee] = useState<Record<string, string>>({});

  const [lateModal, setLateModal] = useState<{
    runId: string;
    item: WorkflowRunItemDto;
    reason: string;
    submitting: boolean;
    error: string | null;
  } | null>(null);

  const [dragTplItemId, setDragTplItemId] = useState<string | null>(null);
  const [editTplId, setEditTplId] = useState<string | null>(null);
  const [menuBusyTplId, setMenuBusyTplId] = useState<string | null>(null);
  const [removingTplIds, setRemovingTplIds] = useState<Set<string>>(() => new Set());
  const [highlightTplId, setHighlightTplId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const cardRefs = useRef<Record<string, HTMLLIElement | null>>({});

  const scrollToCard = useCallback((tplId: string) => {
    requestAnimationFrame(() => {
      cardRefs.current[tplId]?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }, []);

  const refreshAll = useCallback(
    async (opts?: { force?: boolean }) => {
      try {
        const tplKey = "wf-hub:templates";
        const taskKey = "wf-hub:tasks";
        const runKey = canManage ? "wf-hub:runs:mgr" : "wf-hub:runs";
        const doneKey = canManage ? "wf-hub:done:mgr" : "wf-hub:done";
        const dashKey = "wf-hub:dashboard";

        const [tpls, tk, rs, done, ds] = await Promise.all([
          opts?.force
            ? null
            : fetchJsonCached<WorkflowTemplateSummaryDto[]>(
                tplKey,
                "/api/workflows/templates",
                90_000,
              ),
          opts?.force
            ? null
            : fetchJsonCached<WorkflowTaskDto[]>(taskKey, "/api/workflows/tasks", 90_000),
          opts?.force
            ? null
            : fetchJsonCached<WorkflowRunSummaryDto[]>(
                runKey,
                canManage
                  ? "/api/workflows/runs?status=IN_PROGRESS&managerView=1"
                  : "/api/workflows/runs?status=IN_PROGRESS",
                45_000,
              ),
          opts?.force
            ? null
            : fetchJsonCached<WorkflowRunSummaryDto[]>(
                doneKey,
                canManage
                  ? "/api/workflows/runs?status=COMPLETED&includeCompleted=1&managerView=1"
                  : "/api/workflows/runs?status=COMPLETED&includeCompleted=1",
                45_000,
              ),
          canManage && !opts?.force
            ? fetchJsonCached<WorkflowDashboard>(dashKey, "/api/workflows/dashboard", 60_000)
            : Promise.resolve(null),
        ]);

        const fetchFresh = async <T,>(url: string): Promise<T | null> => {
          const res = await fetch(url, { credentials: "same-origin" });
          const j = (await res.json().catch(() => null)) as { ok?: boolean; data?: T } | null;
          return j?.ok && j.data !== undefined ? j.data : null;
        };

        const [tplsFresh, tkFresh, rsFresh, doneFresh, dsFresh] = await Promise.all([
          tpls ?? fetchFresh<WorkflowTemplateSummaryDto[]>("/api/workflows/templates"),
          tk ?? fetchFresh<WorkflowTaskDto[]>("/api/workflows/tasks"),
          rs ??
            fetchFresh<WorkflowRunSummaryDto[]>(
              canManage
                ? "/api/workflows/runs?status=IN_PROGRESS&managerView=1"
                : "/api/workflows/runs?status=IN_PROGRESS",
            ),
          done ??
            fetchFresh<WorkflowRunSummaryDto[]>(
              canManage
                ? "/api/workflows/runs?status=COMPLETED&includeCompleted=1&managerView=1"
                : "/api/workflows/runs?status=COMPLETED&includeCompleted=1",
            ),
          canManage
            ? ds ?? fetchFresh<WorkflowDashboard>("/api/workflows/dashboard")
            : Promise.resolve(null),
        ]);

        if (tplsFresh) {
          setTemplates(tplsFresh.filter((tt) => !tt.archived_at));
          setCached(tplKey, tplsFresh, 90_000);
        }
        if (tkFresh) {
          setTasks(tkFresh);
          setCached(taskKey, tkFresh, 90_000);
        }
        if (rsFresh) setActiveRuns(rsFresh);
        if (doneFresh) setRecentRuns(doneFresh.slice(0, 20));
        if (dsFresh) setDash(dsFresh);
      } finally {
        setLoading(false);
      }
    },
    [canManage],
  );

  const loadTemplateDetail = useCallback(async (id: string) => {
    setDetailLoading(`tpl:${id}`);
    try {
      const res = await fetch(`/api/workflows/templates/${encodeURIComponent(id)}`, {
        credentials: "same-origin",
      });
      const json = (await res.json().catch(() => null)) as
        | { ok: true; data: WorkflowTemplateDetailDto }
        | null;
      if (json?.ok) setTplDetails((prev) => ({ ...prev, [id]: json.data }));
    } finally {
      setDetailLoading(null);
    }
  }, []);

  const loadRunDetail = useCallback(async (id: string) => {
    setDetailLoading(`run:${id}`);
    try {
      const res = await fetch(`/api/workflows/runs/${encodeURIComponent(id)}`, {
        credentials: "same-origin",
      });
      const json = (await res.json().catch(() => null)) as
        | { ok: true; data: WorkflowRunDetailDto }
        | null;
      if (json?.ok) setRunDetails((prev) => ({ ...prev, [id]: json.data }));
    } finally {
      setDetailLoading(null);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => void refreshAll());
  }, [refreshAll]);

  useEffect(() => {
    const hasActive = Object.values(runDetails).some((r) =>
      r.items.some((it) => it.status === "ACTIVE"),
    );
    if (!hasActive) return;
    const h = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(h);
  }, [runDetails]);

  useEffect(() => {
    const h = window.setInterval(() => void refreshAll(), 60_000);
    return () => window.clearInterval(h);
  }, [refreshAll]);

  useEffect(() => {
    const parsed = parseKey(expanded);
    if (!parsed) return;
    if (parsed.kind === "tpl" && !tplDetails[parsed.id]) void loadTemplateDetail(parsed.id);
    if (parsed.kind === "run" && !runDetails[parsed.id]) void loadRunDetail(parsed.id);
  }, [expanded, tplDetails, runDetails, loadTemplateDetail, loadRunDetail]);

  const toggleExpand = (key: ExpandedKey) => {
    setExpanded((prev) => (prev === key ? null : key));
  };

  const expandAllInRun = (runId: string) => {
    setExpanded(cardKey("run", runId));
  };

  const createGroupLockRef = useRef(false);

  const summaryFromDetail = (d: WorkflowTemplateDetailDto): WorkflowTemplateSummaryDto => ({
    id: d.id,
    title: d.title,
    description: d.description,
    color: d.color,
    item_count: d.items?.length ?? 0,
    total_minutes: d.items?.reduce((s, it) => s + it.effective_minutes, 0) ?? 0,
    archived_at: d.archived_at,
    created_at: d.created_at,
    updated_at: d.updated_at,
  });

  const createGroup = async () => {
    const title = newGroupTitle.trim();
    if (!title) {
      showToast({ tone: "warning", title: t("workflows.templates.errEmptyTitle") });
      return;
    }
    if (createGroupLockRef.current || creatingGroup) return;

    const tempId = `temp-tpl-${Date.now()}`;
    const optimisticSummary: WorkflowTemplateSummaryDto = {
      id: tempId,
      title,
      description: null,
      color: newGroupColor,
      item_count: 0,
      total_minutes: 0,
      archived_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    createGroupLockRef.current = true;
    setCreatingGroup(true);
    setTemplates((prev) => [optimisticSummary, ...prev]);
    setTplDetails((prev) => ({
      ...prev,
      [tempId]: { ...optimisticSummary, items: [] },
    }));
    setHighlightTplId(tempId);
    setNewGroupTitle("");
    setCreateGroupOpen(false);

    try {
      const res = await fetch("/api/workflows/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, color: newGroupColor }),
        credentials: "same-origin",
      });
      const json = (await res.json().catch(() => null)) as
        | { ok: true; data: WorkflowTemplateDetailDto }
        | { ok: false; error?: string }
        | null;
      if (!json?.ok) {
        setTemplates((prev) => prev.filter((tt) => tt.id !== tempId));
        setTplDetails((prev) => {
          const next = { ...prev };
          delete next[tempId];
          return next;
        });
        showToast({ tone: "error", title: json?.error ?? t("common.error") });
        return;
      }

      const summary = summaryFromDetail(json.data);
      setTemplates((prev) => prev.map((tt) => (tt.id === tempId ? summary : tt)));
      setTplDetails((prev) => {
        const next = { ...prev };
        delete next[tempId];
        next[json.data.id] = json.data;
        return next;
      });
      setHighlightTplId(json.data.id);
      setExpanded(cardKey("tpl", json.data.id));
      invalidateCacheKey("wf-hub:templates");
      showToast({ tone: "success", title: t("workflows.templates.toastCreated") });
      scrollToCard(json.data.id);
    } catch {
      setTemplates((prev) => prev.filter((tt) => tt.id !== tempId));
      setTplDetails((prev) => {
        const next = { ...prev };
        delete next[tempId];
        return next;
      });
      showToast({ tone: "error", title: t("common.error") });
    } finally {
      createGroupLockRef.current = false;
      setCreatingGroup(false);
    }
  };

  const addTaskToTemplate = async (templateId: string, payload: InlineTaskCreatePayload) => {
    setBusyGroup(true);
    try {
      let taskId = payload.libraryTaskId;
      if (!taskId) {
        const createRes = await fetch("/api/workflows/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: payload.title || t("workflows.cards.untitledTask"),
            description: payload.notes || null,
            estimatedMinutes: payload.estimatedMinutes,
            requireLateReason: true,
          }),
          credentials: "same-origin",
        });
        const created = (await createRes.json().catch(() => null)) as
          | { ok: true; data: WorkflowTaskDto }
          | { ok: false; error?: string }
          | null;
        if (!created?.ok) {
          showToast({ tone: "error", title: created?.error ?? t("common.error") });
          return false;
        }
        taskId = created.data.id;
        setTasks((prev) => [...prev, created.data]);
      }

      const res = await fetch(
        `/api/workflows/templates/${encodeURIComponent(templateId)}/items`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ taskId }),
          credentials: "same-origin",
        },
      );
      const json = (await res.json().catch(() => null)) as
        | { ok: true; data: WorkflowTemplateDetailDto }
        | { ok: false; error?: string }
        | null;
      if (!json?.ok) {
        showToast({ tone: "error", title: json?.error ?? t("common.error") });
        return false;
      }
      setTplDetails((prev) => ({ ...prev, [templateId]: json.data }));
      void refreshAll();
      return true;
    } finally {
      setBusyGroup(false);
    }
  };

  const reorderTemplateItem = async (templateId: string, itemId: string, direction: -1 | 1) => {
    const tpl = tplDetails[templateId];
    if (!tpl) return;
    const arr = tpl.items.map((i) => i.id);
    const idx = arr.indexOf(itemId);
    if (idx < 0) return;
    const ni = idx + direction;
    if (ni < 0 || ni >= arr.length) return;
    [arr[idx], arr[ni]] = [arr[ni], arr[idx]];
    const res = await fetch(
      `/api/workflows/templates/${encodeURIComponent(templateId)}/items`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order: arr }),
        credentials: "same-origin",
      },
    );
    const json = (await res.json().catch(() => null)) as
      | { ok: true; data: WorkflowTemplateDetailDto }
      | null;
    if (json?.ok) setTplDetails((prev) => ({ ...prev, [templateId]: json.data }));
  };

  const dropReorderTemplate = async (templateId: string, targetItemId: string) => {
    if (!dragTplItemId || dragTplItemId === targetItemId) return;
    const tpl = tplDetails[templateId];
    if (!tpl) return;
    const arr = tpl.items.map((i) => i.id);
    const from = arr.indexOf(dragTplItemId);
    const to = arr.indexOf(targetItemId);
    if (from < 0 || to < 0) return;
    arr.splice(from, 1);
    arr.splice(to, 0, dragTplItemId);
    const res = await fetch(
      `/api/workflows/templates/${encodeURIComponent(templateId)}/items`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order: arr }),
        credentials: "same-origin",
      },
    );
    const json = (await res.json().catch(() => null)) as
      | { ok: true; data: WorkflowTemplateDetailDto }
      | null;
    if (json?.ok) setTplDetails((prev) => ({ ...prev, [templateId]: json.data }));
    setDragTplItemId(null);
  };

  const removeTemplateItem = async (templateId: string, itemId: string) => {
    const res = await fetch(
      `/api/workflows/templates/${encodeURIComponent(templateId)}/items/${encodeURIComponent(itemId)}`,
      { method: "DELETE", credentials: "same-origin" },
    );
    const json = (await res.json().catch(() => null)) as
      | { ok: true; data: WorkflowTemplateDetailDto }
      | null;
    if (json?.ok) setTplDetails((prev) => ({ ...prev, [templateId]: json.data }));
  };

  const duplicateTemplate = async (templateId: string) => {
    setMenuBusyTplId(templateId);
    try {
      const res = await fetch(
        `/api/workflows/templates/${encodeURIComponent(templateId)}/duplicate`,
        { method: "POST", credentials: "same-origin" },
      );
      const json = (await res.json().catch(() => null)) as
        | { ok: true; data: WorkflowTemplateDetailDto }
        | { ok: false; error?: string }
        | null;
      if (!json?.ok) {
        showToast({ tone: "error", title: json?.error ?? t("common.error") });
        return;
      }
      showToast({
        tone: "success",
        title: t("workflows.cards.duplicateToast"),
        description: json.data.title,
      });
      setTplDetails((prev) => ({ ...prev, [json.data.id]: json.data }));
      setHighlightTplId(json.data.id);
      setExpanded(cardKey("tpl", json.data.id));
      await refreshAll();
      scrollToCard(json.data.id);
      window.setTimeout(() => setHighlightTplId(null), 2400);
    } finally {
      setMenuBusyTplId(null);
    }
  };

  const confirmDeleteTemplate = async () => {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    setDeleteBusy(true);
    setRemovingTplIds((prev) => new Set(prev).add(id));
    try {
      const res = await fetch(`/api/workflows/templates/${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!json?.ok) {
        showToast({ tone: "error", title: json?.error ?? t("common.error") });
        setRemovingTplIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        return;
      }
      showToast({ tone: "success", title: t("workflows.cards.deleteToast") });
      await new Promise((r) => window.setTimeout(r, 320));
      setTemplates((prev) => prev.filter((x) => x.id !== id));
      setTplDetails((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      if (expanded === cardKey("tpl", id)) setExpanded(null);
      void refreshAll();
    } finally {
      setDeleteBusy(false);
      setDeleteTarget(null);
      setRemovingTplIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleTemplateMenu = (tplId: string, action: TaskGroupMenuAction) => {
    if (action === "edit") {
      setEditTplId(tplId);
      setExpanded(cardKey("tpl", tplId));
      void loadTemplateDetail(tplId);
      return;
    }
    if (action === "duplicate") {
      void duplicateTemplate(tplId);
      return;
    }
    if (action === "delete") {
      const tpl = templates.find((x) => x.id === tplId);
      setDeleteTarget({ id: tplId, title: tpl?.title ?? "" });
    }
  };

  const launchRun = async (templateId: string) => {
    const aid = (launchAssignee[templateId] || user?.id || "").trim();
    if (!aid) {
      showToast({ tone: "warning", title: t("workflows.launcher.errRequired") });
      return;
    }
    setBusyGroup(true);
    try {
      const res = await fetch("/api/workflows/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId, assigneeId: aid }),
        credentials: "same-origin",
      });
      const json = (await res.json().catch(() => null)) as
        | { ok: true; data: WorkflowRunDetailDto }
        | { ok: false; error?: string }
        | null;
      if (!json?.ok) {
        showToast({ tone: "error", title: json?.error ?? t("common.error") });
        return;
      }
      showToast({ tone: "success", title: t("workflows.launcher.toastLaunched") });
      setLaunchOpen((p) => ({ ...p, [templateId]: false }));
      setExpanded(cardKey("run", json.data.id));
      setRunDetails((prev) => ({ ...prev, [json.data.id]: json.data }));
      await refreshAll();
    } finally {
      setBusyGroup(false);
    }
  };

  const callRunItem = useCallback(
    async (
      run: WorkflowRunDetailDto,
      item: WorkflowRunItemDto,
      action: "start" | "complete" | "skip",
      lateReason?: string,
    ) => {
      setBusyItemId(item.id);
      try {
        const res = await fetch(
          `/api/workflows/runs/${encodeURIComponent(run.id)}/items/${encodeURIComponent(item.id)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action, lateReason: lateReason ?? null }),
            credentials: "same-origin",
          },
        );
        const json = (await res.json().catch(() => null)) as
          | { ok: true; data: WorkflowRunDetailDto }
          | { ok: false; code?: string; error?: string }
          | null;
        if (!json?.ok) {
          if (json?.code === "LATE_REASON_REQUIRED") {
            setLateModal({ runId: run.id, item, reason: "", submitting: false, error: json.error ?? null });
            return;
          }
          showToast({ tone: "error", title: json?.error ?? t("workflows.runner.toast.actionFailed") });
          return;
        }
        setRunDetails((prev) => ({ ...prev, [run.id]: json.data }));
        void refreshAll();
      } finally {
        setBusyItemId(null);
      }
    },
    [refreshAll, showToast, t],
  );

  const submitLate = async () => {
    if (!lateModal) return;
    const run = runDetails[lateModal.runId];
    if (!run) return;
    const reason = lateModal.reason.trim();
    if (!reason) {
      setLateModal({ ...lateModal, error: t("workflows.runner.lateReasonRequired") });
      return;
    }
    setLateModal({ ...lateModal, submitting: true, error: null });
    await callRunItem(run, lateModal.item, "complete", reason);
    setLateModal(null);
  };

  const visibleTemplates = useMemo(() => templates, [templates]);

  const historyOnly = useMemo(
    () =>
      recentRuns.filter((r) => !activeRuns.some((a) => a.id === r.id)).slice(0, 8),
    [recentRuns, activeRuns],
  );

  return (
    <div dir={dir} className="tcg-page min-h-0 space-y-3 pb-6">
      {!hideHeader ? (
        <header className="flex flex-wrap items-center justify-between gap-2 px-0.5">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-wider text-violet-800">
              {t("workflows.page.kicker")}
            </p>
            <h1 className="text-lg font-black text-slate-950 sm:text-xl">
              {t("workflows.page.hub.pageTitle")}
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {canManage && dash ? (
              <>
                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-black text-blue-900">
                  {t("workflows.page.stats.activeGroups")}: {dash.active_runs}
                </span>
                <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-black text-rose-900">
                  {t("workflows.page.stats.late")}: {dash.runs_with_lates_today}
                </span>
              </>
            ) : null}
            <button
              type="button"
              onClick={() => void refreshAll()}
              className="inline-flex h-9 items-center gap-1 rounded-xl bg-white/80 px-2.5 text-xs font-black text-slate-800 shadow-sm ring-1 ring-slate-200/80"
            >
              {loading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" aria-hidden />
              )}
            </button>
          </div>
        </header>
      ) : (
        <div className="flex justify-end px-0.5">
          <button
            type="button"
            onClick={() => void refreshAll()}
            className="inline-flex h-9 items-center gap-1 rounded-xl bg-white/80 px-2.5 text-xs font-black text-slate-800 shadow-sm ring-1 ring-slate-200/80"
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            )}
          </button>
        </div>
      )}

      {canManage && createGroupOpen ? (
        <div className="tcg-fade-in rounded-2xl bg-gradient-to-br from-violet-200 to-blue-200 p-3 shadow-md">
          <input
            type="text"
            value={newGroupTitle}
            onChange={(e) => setNewGroupTitle(e.target.value)}
            placeholder={t("taskGroups.section.titlePlaceholder")}
            className="h-10 w-full rounded-xl border-0 bg-white/90 px-3 text-sm font-bold shadow-sm"
          />
          <div className="mt-2 flex flex-wrap gap-1">
            {COLOR_PRESETS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setNewGroupColor(c)}
                className={`h-7 w-7 rounded-full border-2 ${c === newGroupColor ? "border-slate-900" : "border-white"}`}
                style={{ background: c }}
                aria-label={c}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => void createGroup()}
            disabled={creatingGroup}
            className="mt-2 flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 text-sm font-black text-white"
          >
            {creatingGroup ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
            {creatingGroup ? t("taskGroups.section.saving") : t("taskGroups.section.createButton")}
          </button>
        </div>
      ) : null}

      {loading && templates.length === 0 && activeRuns.length === 0 ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-7 w-7 animate-spin text-violet-600" aria-hidden />
        </div>
      ) : !loading && !canManage && activeRuns.length === 0 ? (
        <p className="rounded-2xl bg-gradient-to-br from-violet-100 to-blue-100 px-4 py-8 text-center text-sm font-bold text-slate-700">
          {t("workflows.employee.noTemplates")}
        </p>
      ) : (
        <MobileTaskGrid>
          {canManage ? (
            <li>
              <button
                type="button"
                onClick={() => setCreateGroupOpen((v) => !v)}
                className="flex h-full min-h-[140px] w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-violet-300/80 bg-violet-50/50 p-4 text-violet-900 transition hover:scale-[1.02] hover:border-violet-400 hover:bg-violet-50"
              >
                <Plus className="h-8 w-8" aria-hidden />
                <span className="text-xs font-black">{t("workflows.page.left.newGroup")}</span>
              </button>
            </li>
          ) : null}

          {activeRuns.map((run, i) => {
            const key = cardKey("run", run.id);
            const detail = runDetails[run.id];
            const isExp = expanded === key;
            const completed = run.completed_count;
            const total = run.item_count;
            const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
            const statusVariant = run.late_count > 0 ? "LATE" : "IN_PROGRESS";

            return (
              <TaskGroupCard
                key={run.id}
                id={run.id}
                title={run.title}
                emoji="⚡"
                subtitle={run.template_title ?? undefined}
                color={null}
                gradientIndex={i + 2}
                assigneeName={canManage ? run.assignee_name : undefined}
                stats={{
                  total,
                  open: total - completed,
                  completed,
                  late: run.late_count,
                  progressPct: pct,
                }}
                statusVariant={statusVariant}
                statusLabel={
                  run.late_count > 0
                    ? t("workflows.page.badge.late")
                    : t("workflows.page.badge.inProgress")
                }
                expanded={isExp}
                onToggleExpand={() => toggleExpand(key)}
                loading={isExp && !detail && detailLoading === key}
                footer={
                  detail ? (
                    <>
                      <TaskGroupCardFooterAction
                        label={t("workflows.cards.expandAll")}
                        onClick={() => expandAllInRun(run.id)}
                      />
                      {canManage && detail.status === "IN_PROGRESS" ? (
                        <TaskGroupCardFooterAction
                          label={t("workflows.page.center.endGroup")}
                          onClick={async () => {
                            if (!window.confirm(t("workflows.runner.confirmAbort"))) return;
                            await fetch(`/api/workflows/runs/${encodeURIComponent(run.id)}`, {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ action: "abort" }),
                              credentials: "same-origin",
                            });
                            void refreshAll();
                          }}
                        />
                      ) : null}
                    </>
                  ) : undefined
                }
              >
                {detail?.items.map((it) => {
                  const canStart =
                    detail.status === "IN_PROGRESS" &&
                    it.status === "PENDING" &&
                    !detail.items.some((o) => o.status === "ACTIVE") &&
                    !detail.items.some(
                      (o) =>
                        o.order_index < it.order_index &&
                        o.status !== "COMPLETED" &&
                        o.status !== "SKIPPED",
                    );
                  const isAssignee = detail.assignee_id === user?.id;
                  const canControl = isAssignee || canManage;
                  return (
                    <TaskMiniCard
                      key={it.id}
                      kind="run"
                      item={it}
                      now={now}
                      busy={busyItemId === it.id}
                      canStart={canControl && canStart}
                      canComplete={canControl && it.status === "ACTIVE"}
                      canSkip={canManage && it.status !== "COMPLETED" && it.status !== "SKIPPED"}
                      onStart={() => void callRunItem(detail, it, "start")}
                      onComplete={() => void callRunItem(detail, it, "complete")}
                      onSkip={() => void callRunItem(detail, it, "skip")}
                    />
                  );
                })}
              </TaskGroupCard>
            );
          })}

          {canManage
            ? visibleTemplates.map((tpl, i) => {
                const key = cardKey("tpl", tpl.id);
                const isExp = expanded === key;
                const detail = tplDetails[tpl.id];
                const total = tpl.item_count;
                const pct = 0;

                return (
                  <TaskGroupCard
                    key={tpl.id}
                    id={tpl.id}
                    cardRef={(el) => {
                      cardRefs.current[tpl.id] = el;
                    }}
                    removing={removingTplIds.has(tpl.id)}
                    highlight={highlightTplId === tpl.id}
                    title={tpl.title}
                    emoji="🍰"
                    subtitle={t("workflows.cards.templateSubtitle", {
                      n: tpl.item_count,
                      m: tpl.total_minutes,
                    })}
                    color={tpl.color}
                    gradientIndex={i}
                    stats={{
                      total,
                      open: total,
                      completed: 0,
                      late: 0,
                      progressPct: pct,
                    }}
                    statusVariant="OPEN"
                    statusLabel={t("workflows.cards.templateBadge")}
                    expanded={isExp}
                    onToggleExpand={() => toggleExpand(key)}
                    loading={isExp && !detail && detailLoading === key}
                    actionsMenu={
                      <TaskGroupCardMenu
                        busy={menuBusyTplId === tpl.id}
                        onAction={(action) => handleTemplateMenu(tpl.id, action)}
                      />
                    }
                    footer={
                      <>
                        {launchOpen[tpl.id] ? (
                          <div className="space-y-1.5 rounded-xl bg-white/85 p-2">
                            <select
                              value={launchAssignee[tpl.id] ?? ""}
                              onChange={(e) =>
                                setLaunchAssignee((p) => ({ ...p, [tpl.id]: e.target.value }))
                              }
                              className="h-9 w-full rounded-lg px-2 text-xs font-bold ring-1 ring-slate-200"
                            >
                              <option value="">{t("workflows.launcher.pickAssignee")}</option>
                              {employees.map((e) => (
                                <option key={e.id} value={e.id}>
                                  {e.fullName}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() => void launchRun(tpl.id)}
                              disabled={busyGroup || tpl.item_count === 0}
                              className="flex h-10 w-full items-center justify-center gap-1 rounded-xl bg-slate-900 text-xs font-black text-white disabled:opacity-50"
                            >
                              <Sparkles className="h-3.5 w-3.5" aria-hidden />
                              {t("workflows.page.left.launch")}
                            </button>
                          </div>
                        ) : (
                          <TaskGroupCardFooterAction
                            icon={Sparkles}
                            label={t("workflows.page.left.launch")}
                            primary
                            onClick={() => setLaunchOpen((p) => ({ ...p, [tpl.id]: true }))}
                          />
                        )}
                        <InlineTaskCreator
                          open={!!addTaskOpen[tpl.id]}
                          onToggle={() =>
                            setAddTaskOpen((p) => ({ ...p, [tpl.id]: !p[tpl.id] }))
                          }
                          libraryTasks={tasks}
                          showLibraryPick
                          busy={busyGroup}
                          onSubmit={(payload) => addTaskToTemplate(tpl.id, payload)}
                        />
                      </>
                    }
                  >
                    {editTplId === tpl.id && detail ? (
                      <li>
                        <TemplateGroupEditInline
                          template={detail}
                          onSaved={(updated) => {
                            setTplDetails((prev) => ({ ...prev, [tpl.id]: updated }));
                            setTemplates((prev) =>
                              prev.map((x) =>
                                x.id === tpl.id
                                  ? {
                                      ...x,
                                      title: updated.title,
                                      color: updated.color,
                                      description: updated.description,
                                    }
                                  : x,
                              ),
                            );
                            setEditTplId(null);
                            showToast({ tone: "success", title: t("workflows.templates.toastSaved") });
                          }}
                          onCancel={() => setEditTplId(null)}
                        />
                      </li>
                    ) : null}
                    {detail?.items.map((it, idx) => (
                      <TaskMiniCard
                        key={it.id}
                        kind="template"
                        item={it}
                        index={idx}
                        canManage={canManage}
                        draggable={canManage}
                        onDragStart={() => setDragTplItemId(it.id)}
                        onDragOver={(e) => {
                          e.preventDefault();
                        }}
                        onDrop={() => void dropReorderTemplate(tpl.id, it.id)}
                        onMoveUp={() => void reorderTemplateItem(tpl.id, it.id, -1)}
                        onMoveDown={() => void reorderTemplateItem(tpl.id, it.id, 1)}
                        onRemove={() => void removeTemplateItem(tpl.id, it.id)}
                      />
                    ))}
                  </TaskGroupCard>
                );
              })
            : null}
        </MobileTaskGrid>
      )}

      {historyOnly.length > 0 ? (
        <details className="rounded-xl bg-slate-100/80 px-3 py-2">
          <summary className="cursor-pointer text-xs font-black text-slate-700">
            {t("workflows.page.hub.tabHistory")} ({historyOnly.length})
          </summary>
          <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
            {historyOnly.map((r, i) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => {
                    setExpanded(cardKey("run", r.id));
                    void loadRunDetail(r.id);
                  }}
                  className="w-full rounded-xl bg-white px-2 py-2 text-start text-[10px] font-bold text-slate-800 shadow-sm transition hover:scale-[1.02]"
                >
                  <span className="font-black">{r.title}</span>
                  <br />
                  {r.assignee_name} · {r.completed_count}/{r.item_count}
                </button>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <TaskGroupDeleteModal
        open={deleteTarget !== null}
        groupTitle={deleteTarget?.title ?? ""}
        busy={deleteBusy}
        onCancel={() => !deleteBusy && setDeleteTarget(null)}
        onConfirm={() => void confirmDeleteTemplate()}
      />

      {lateModal ? (
        <div
          className="fixed inset-0 z-[120] flex items-end justify-center bg-black/50 p-3 sm:items-center"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget && !lateModal.submitting) setLateModal(null);
          }}
        >
          <div className="tcg-fade-in w-full max-w-md rounded-2xl bg-white p-4 shadow-2xl">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-rose-600" aria-hidden />
              <h3 className="text-base font-black text-slate-950">
                {t("workflows.runner.lateModalTitle")}
              </h3>
            </div>
            <p className="mt-1 text-xs font-bold text-slate-600">{lateModal.item.title}</p>
            <textarea
              value={lateModal.reason}
              onChange={(e) =>
                setLateModal((p) => (p ? { ...p, reason: e.target.value, error: null } : p))
              }
              rows={3}
              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              placeholder={t("workflows.runner.lateModalPlaceholder")}
            />
            {lateModal.error ? (
              <p className="mt-1 text-xs font-bold text-rose-700">{lateModal.error}</p>
            ) : null}
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => setLateModal(null)}
                className="flex-1 rounded-xl border border-slate-200 py-2 text-xs font-bold"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                onClick={() => void submitLate()}
                disabled={lateModal.submitting}
                className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-rose-600 py-2 text-xs font-black text-white"
              >
                {lateModal.submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Check className="h-4 w-4" aria-hidden />
                )}
                {t("workflows.runner.lateModalSubmit")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
