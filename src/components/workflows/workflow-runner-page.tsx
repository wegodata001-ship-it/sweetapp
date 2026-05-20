"use client";

/**
 * Workflow Runner Page — Monday / Notion / Kitchen-style ERP layout.
 *
 *   ┌────────────────────────── 5 KPI cards ──────────────────────────┐
 *   │                                                                 │
 *   ├──────────┬─────────────────────────┬────────────────────────────┤
 *   │ Left col │ Center col (live run)   │ Right col                  │
 *   │ Templates│  • header w/ progress   │ Task library               │
 *   │ + search │  • big timer box        │ + search                   │
 *   │ + new    │  • active task card     │ small reusable cards       │
 *   │ + cards  │  • steps flow (lines)   │                            │
 *   │          │  • action footer        │                            │
 *   └──────────┴─────────────────────────┴────────────────────────────┘
 *   ┌─────────────────── Recent runs table ───────────────────────────┐
 *   │ group | employee | start | end | time | progress | status       │
 *   └─────────────────────────────────────────────────────────────────┘
 *
 * Timer math — single setInterval at the page level provides `now` to all
 * step cards. Each card derives its elapsed/remaining from `started_at`, so
 * a browser refresh keeps the same values.
 *
 * Sequential gating, late-reason modal, abort, skip — all server-enforced via
 * `/api/workflows/runs/[id]/items/[itemId]` so the UI just renders state.
 */

import {
  AlertTriangle,
  Calendar,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Copy,
  Edit3,
  Flag,
  GripVertical,
  Library,
  Loader2,
  Pause,
  Play,
  Plus,
  Search,
  Sparkles,
  Square,
  Timer,
  Trash2,
  TrendingUp,
  Users,
  Workflow,
  X,
} from "lucide-react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth-provider";
import { useI18n } from "@/components/i18n-provider";
import { useToast } from "@/components/toast-provider";
import {
  itemElapsedMs,
  itemIsLate,
} from "@/lib/workflows/run-helpers";
import type {
  WorkflowRunDetailDto,
  WorkflowRunItemDto,
  WorkflowRunSummaryDto,
  WorkflowRunStatus,
  WorkflowTaskDto,
  WorkflowTemplateDetailDto,
  WorkflowTemplateSummaryDto,
} from "@/lib/workflows/serialize";

const COLOR_PRESETS = [
  "#2563eb",
  "#16a34a",
  "#f59e0b",
  "#dc2626",
  "#7c3aed",
  "#0ea5e9",
  "#475569",
];

const STATS_TONE = {
  blue: "bg-blue-50 text-blue-950 border-blue-200",
  emerald: "bg-emerald-50 text-emerald-950 border-emerald-200",
  rose: "bg-rose-50 text-rose-950 border-rose-200",
  amber: "bg-amber-50 text-amber-950 border-amber-200",
  slate: "bg-slate-50 text-slate-950 border-slate-200",
} as const;

type WorkflowDashboard = {
  active_runs: number;
  employees_late: number;
  completed_today: number;
  runs_with_lates_today: number;
  avg_actual_minutes: number | null;
  completion_rate: number;
  top_overdue_runs: { id: string; title: string; assignee: string; late: number }[];
};

export type WorkflowEmployeeOption = {
  id: string;
  fullName: string;
  email: string;
  role: string;
};

export function WorkflowRunnerPage({
  employees,
  canManage,
}: {
  employees: WorkflowEmployeeOption[];
  canManage: boolean;
}) {
  const { t, dir } = useI18n();
  const { user } = useAuth();
  const { showToast } = useToast();

  // ──────────────────────────────────────────────────────────────────
  // single `now` ticker at the page level
  // ──────────────────────────────────────────────────────────────────
  const [now, setNow] = useState(() => Date.now());

  // ──────────────────────────────────────────────────────────────────
  // data
  // ──────────────────────────────────────────────────────────────────
  const [templates, setTemplates] = useState<WorkflowTemplateSummaryDto[]>([]);
  const [tasks, setTasks] = useState<WorkflowTaskDto[]>([]);
  const [activeRuns, setActiveRuns] = useState<WorkflowRunSummaryDto[]>([]);
  const [recentRuns, setRecentRuns] = useState<WorkflowRunSummaryDto[]>([]);
  const [dash, setDash] = useState<WorkflowDashboard | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [selectedRun, setSelectedRun] = useState<WorkflowRunDetailDto | null>(null);

  const [loading, setLoading] = useState(true);
  const [templatesSearch, setTemplatesSearch] = useState("");
  const [librarySearch, setLibrarySearch] = useState("");

  const [templateEditorId, setTemplateEditorId] = useState<string | null>(null);
  const [creatingTemplate, setCreatingTemplate] = useState(false);
  const [creatingTask, setCreatingTask] = useState(false);
  const [launchOpen, setLaunchOpen] = useState(false);
  const [preselectedLaunchTemplate, setPreselectedLaunchTemplate] = useState<string | null>(null);

  type EmployeeTasksMainTab = "templates" | "runs" | "history";
  const [mainTab, setMainTab] = useState<EmployeeTasksMainTab>("runs");

  const goTab = useCallback((tab: EmployeeTasksMainTab) => {
    setMainTab(tab);
    if (typeof window === "undefined") return;
    const hash =
      tab === "templates" ? "#workflow-groups" : tab === "runs" ? "#workflow-runs" : "#workflow-history";
    window.history.replaceState(null, "", hash);
  }, []);

  useEffect(() => {
    const syncFromHash = () => {
      const h = window.location.hash;
      if (h === "#workflow-groups") setMainTab("templates");
      else if (h === "#workflow-history") setMainTab("history");
      else if (h === "#workflow-runs") setMainTab("runs");
    };
    syncFromHash();
    window.addEventListener("hashchange", syncFromHash);
    return () => window.removeEventListener("hashchange", syncFromHash);
  }, []);

  // ──────────────────────────────────────────────────────────────────
  // data fetching
  // ──────────────────────────────────────────────────────────────────
  const refreshAll = useCallback(async () => {
    try {
      const [tplsRes, tasksRes, runsRes, doneRes, dashRes] = await Promise.all([
        fetch("/api/workflows/templates", { credentials: "same-origin" }),
        fetch("/api/workflows/tasks", { credentials: "same-origin" }),
        fetch("/api/workflows/runs?status=IN_PROGRESS&managerView=1", { credentials: "same-origin" }),
        fetch("/api/workflows/runs?status=COMPLETED&includeCompleted=1&managerView=1", {
          credentials: "same-origin",
        }),
        canManage
          ? fetch("/api/workflows/dashboard", { credentials: "same-origin" })
          : Promise.resolve(null),
      ]);
      const tpls = (await tplsRes.json().catch(() => null)) as
        | { ok: true; data: WorkflowTemplateSummaryDto[] }
        | null;
      const tk = (await tasksRes.json().catch(() => null)) as
        | { ok: true; data: WorkflowTaskDto[] }
        | null;
      const rs = (await runsRes.json().catch(() => null)) as
        | { ok: true; data: WorkflowRunSummaryDto[] }
        | null;
      const done = (await doneRes.json().catch(() => null)) as
        | { ok: true; data: WorkflowRunSummaryDto[] }
        | null;
      const ds = dashRes
        ? ((await dashRes.json().catch(() => null)) as
            | { ok: true; data: WorkflowDashboard }
            | null)
        : null;
      setTemplates(tpls?.ok ? tpls.data.filter((tt) => !tt.archived_at) : []);
      setTasks(tk?.ok ? tk.data : []);
      setActiveRuns(rs?.ok ? rs.data : []);
      setRecentRuns(done?.ok ? done.data.slice(0, 25) : []);
      setDash(ds?.ok ? ds.data : null);

      // Auto-select the currently active run for the assignee if nothing selected.
      const list = rs?.ok ? rs.data : [];
      if (list.length > 0 && !selectedRunId) {
        const mine = list.find((r) => r.assignee_id === user?.id) ?? list[0];
        setSelectedRunId(mine.id);
      } else if (list.length === 0) {
        setSelectedRunId(null);
      }
    } finally {
      setLoading(false);
    }
  }, [canManage, user?.id, selectedRunId]);

  const loadRunDetail = useCallback(async (id: string) => {
    const res = await fetch(`/api/workflows/runs/${encodeURIComponent(id)}`, {
      credentials: "same-origin",
    });
    const json = (await res.json().catch(() => null)) as
      | { ok: true; data: WorkflowRunDetailDto }
      | null;
    if (json?.ok) setSelectedRun(json.data);
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void refreshAll();
    });
  }, [refreshAll]);

  // ticker: 1 second when an active run exists, otherwise 30s
  useEffect(() => {
    const hasActiveItem =
      selectedRun?.items.some((it) => it.status === "ACTIVE") ?? false;
    if (!hasActiveItem) return;
    const handle = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(handle);
  }, [selectedRun]);

  // background refresh of summaries every 30s
  useEffect(() => {
    const handle = window.setInterval(() => void refreshAll(), 30_000);
    return () => window.clearInterval(handle);
  }, [refreshAll]);

  useEffect(() => {
    if (!selectedRunId) {
      queueMicrotask(() => setSelectedRun(null));
      return;
    }
    queueMicrotask(() => {
      void loadRunDetail(selectedRunId);
    });
  }, [selectedRunId, loadRunDetail]);

  // ──────────────────────────────────────────────────────────────────
  // derived sets
  // ──────────────────────────────────────────────────────────────────
  const filteredTemplates = useMemo(() => {
    const q = templatesSearch.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter(
      (tt) =>
        tt.title.toLowerCase().includes(q) ||
        (tt.description ?? "").toLowerCase().includes(q),
    );
  }, [templates, templatesSearch]);

  const filteredTasks = useMemo(() => {
    const active = tasks.filter((t) => !t.archived_at);
    const q = librarySearch.trim().toLowerCase();
    if (!q) return active;
    return active.filter(
      (tt) =>
        tt.title.toLowerCase().includes(q) ||
        (tt.description ?? "").toLowerCase().includes(q),
    );
  }, [tasks, librarySearch]);

  return (
    <div dir={dir} className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm md:p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-black uppercase tracking-wider text-violet-700">
              {t("workflows.page.kicker")}
            </p>
            <h1 className="text-xl font-black text-slate-950 md:text-2xl">{t("workflows.page.hub.pageTitle")}</h1>
            <p className="mt-0.5 text-sm text-slate-500">{t("workflows.page.subtitle")}</p>
          </div>
          {canManage ? (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => goTab("templates")}
                className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-800 shadow-sm transition hover:bg-slate-50 md:px-4 md:text-sm"
              >
                {t("workflows.page.hub.openTemplates")}
              </button>
              <button
                type="button"
                onClick={() => {
                  goTab("templates");
                  setCreatingTemplate(true);
                }}
                className="inline-flex items-center justify-center gap-1 rounded-xl bg-[#2563eb] px-3 py-2 text-xs font-black text-white shadow-sm transition hover:bg-blue-700 md:px-4 md:text-sm"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden />
                {t("workflows.page.hub.buildTemplate")}
              </button>
            </div>
          ) : null}
        </div>
        <div
          className="mt-4 flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1"
          role="tablist"
          aria-label={t("workflows.page.hub.pageTitle")}
        >
          {(["templates", "runs", "history"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={mainTab === tab}
              onClick={() => goTab(tab)}
              className={`rounded-lg px-3 py-2 text-xs font-black transition md:text-sm ${
                mainTab === tab ? "bg-white text-slate-950 shadow-sm" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {tab === "templates"
                ? t("workflows.page.hub.tabTemplates")
                : tab === "runs"
                  ? t("workflows.page.hub.tabRuns")
                  : t("workflows.page.hub.tabHistory")}
            </button>
          ))}
        </div>
      </div>

      {/* ───────────── TOP STATS STRIP ───────────── */}
      <section
        id="workflow-stats"
        className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-5"
      >
        <StatCard
          label={t("workflows.page.stats.total")}
          value={tasks.length}
          icon={Library}
          tone="slate"
        />
        <StatCard
          label={t("workflows.page.stats.activeGroups")}
          value={activeRuns.length}
          icon={Play}
          tone="blue"
        />
        <StatCard
          label={t("workflows.page.stats.late")}
          value={dash?.runs_with_lates_today ?? 0}
          icon={AlertTriangle}
          tone="rose"
        />
        <StatCard
          label={t("workflows.page.stats.completedToday")}
          value={dash?.completed_today ?? 0}
          icon={CheckCircle2}
          tone="emerald"
        />
        <StatCard
          label={t("workflows.page.stats.avgMinutes")}
          value={dash?.avg_actual_minutes != null ? `${dash.avg_actual_minutes}'` : "—"}
          icon={TrendingUp}
          tone="amber"
        />
      </section>

      {mainTab === "templates" ? (
        <>
          <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <aside
              id="workflow-groups"
              className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm lg:h-[calc(100vh-320px)] lg:overflow-hidden"
            >
              <header className="flex items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 text-sm font-black text-slate-950">
                  <Sparkles className="h-4 w-4 text-violet-600" aria-hidden />
                  {t("workflows.page.left.title")}
                </h2>
                {canManage ? (
                  <button
                    type="button"
                    onClick={() => {
                      goTab("templates");
                      setCreatingTemplate(true);
                    }}
                    className="inline-flex items-center gap-1 rounded-xl bg-[#2563eb] px-2.5 py-1.5 text-xs font-black text-white shadow-sm transition hover:bg-blue-700"
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden />
                    {t("workflows.page.left.newGroup")}
                  </button>
                ) : null}
              </header>
              <SearchInput
                value={templatesSearch}
                onChange={setTemplatesSearch}
                placeholder={t("workflows.page.left.searchPlaceholder")}
              />
              <div className="flex-1 space-y-1.5 overflow-y-auto pe-1">
                {loading && filteredTemplates.length === 0 ? (
                  <div className="flex justify-center py-6">
                    <Loader2 className="h-5 w-5 animate-spin text-slate-400" aria-hidden />
                  </div>
                ) : filteredTemplates.length === 0 ? (
                  <EmptyHint text={t("workflows.page.left.empty")} />
                ) : (
                  filteredTemplates.map((tt) => (
                    <TemplateCard
                      key={tt.id}
                      template={tt}
                      canEdit={canManage}
                      onEdit={() => setTemplateEditorId(tt.id)}
                      onLaunch={() => {
                        setPreselectedLaunchTemplate(tt.id);
                        setLaunchOpen(true);
                      }}
                    />
                  ))
                )}
              </div>
            </aside>

            <aside className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm lg:h-[calc(100vh-320px)] lg:overflow-hidden">
              <header className="flex items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 text-sm font-black text-slate-950">
                  <Library className="h-4 w-4 text-violet-700" aria-hidden />
                  {t("workflows.page.right.title")}
                </h2>
                {canManage ? (
                  <button
                    type="button"
                    onClick={() => setCreatingTask(true)}
                    className="inline-flex items-center gap-1 rounded-xl bg-violet-600 px-2.5 py-1.5 text-xs font-black text-white shadow-sm transition hover:bg-violet-700"
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden />
                    {t("workflows.page.right.newTask")}
                  </button>
                ) : null}
              </header>
              <SearchInput
                value={librarySearch}
                onChange={setLibrarySearch}
                placeholder={t("workflows.page.right.searchPlaceholder")}
              />
              <div className="flex-1 space-y-1.5 overflow-y-auto pe-1">
                {loading && filteredTasks.length === 0 ? (
                  <div className="flex justify-center py-6">
                    <Loader2 className="h-5 w-5 animate-spin text-slate-400" aria-hidden />
                  </div>
                ) : filteredTasks.length === 0 ? (
                  <EmptyHint text={t("workflows.page.right.empty")} />
                ) : (
                  filteredTasks.map((tt) => <TaskLibraryCard key={tt.id} task={tt} />)
                )}
              </div>
              <p className="mt-1 text-[10px] font-bold text-slate-400">
                {t("workflows.page.right.totalHint", { n: filteredTasks.length, all: tasks.length })}
              </p>
            </aside>
          </section>
          {canManage ? (
            <section className="rounded-2xl border border-violet-200 bg-violet-50/70 p-4 text-sm shadow-sm">
              <p className="font-black text-violet-950">{t("nav.adminTasks")}</p>
              <p className="mt-1 text-xs font-semibold text-violet-900/90">
                {t("workflows.page.workTasksMovedHint")}
              </p>
              <Link
                href="/admin/tasks"
                className="mt-3 inline-flex items-center rounded-xl bg-violet-700 px-3 py-2 text-xs font-black text-white hover:bg-violet-800"
              >
                {t("workflows.page.workTasksOpenAdmin")}
              </Link>
            </section>
          ) : null}
        </>
      ) : null}

      {mainTab === "runs" ? (
        <section className="grid grid-cols-1">
          <main id="workflow-runs" className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <LiveRunPanel
              activeRuns={activeRuns}
              selectedRunId={selectedRunId}
              onSelect={setSelectedRunId}
              run={selectedRun}
              now={now}
              canManage={canManage}
              onLaunch={() => setLaunchOpen(true)}
              onChanged={() => {
                void refreshAll();
                if (selectedRunId) void loadRunDetail(selectedRunId);
              }}
              onToast={(args) => showToast(args)}
            />
          </main>
        </section>
      ) : null}

      {mainTab === "history" ? (
        <section
          id="workflow-history"
          className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm md:p-4"
        >
          <header className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-sm font-black text-slate-950">
              <Clock className="h-4 w-4 text-slate-600" aria-hidden />
              {t("workflows.page.history.title")}
            </h2>
            <span className="text-xs font-bold text-slate-500">
              {t("workflows.page.history.count", { n: recentRuns.length, running: activeRuns.length })}
            </span>
          </header>
          <RecentRunsTable
            activeRuns={activeRuns}
            recentRuns={recentRuns}
            onOpen={(id) => {
              setSelectedRunId(id);
              goTab("runs");
            }}
          />
        </section>
      ) : null}

      {/* ───────────── MODALS ───────────── */}
      {launchOpen ? (
        <LaunchRunModal
          employees={employees}
          templates={templates}
          preselectedTemplateId={preselectedLaunchTemplate}
          onClose={() => {
            setLaunchOpen(false);
            setPreselectedLaunchTemplate(null);
          }}
          onLaunched={(runId) => {
            setLaunchOpen(false);
            setPreselectedLaunchTemplate(null);
            setSelectedRunId(runId);
            goTab("runs");
            void refreshAll();
          }}
          canSelectAssignee={canManage}
          selfId={user?.id ?? null}
        />
      ) : null}

      {templateEditorId ? (
        <TemplateEditorModal
          templateId={templateEditorId}
          tasks={tasks}
          canEdit={canManage}
          onClose={() => setTemplateEditorId(null)}
          onChanged={() => void refreshAll()}
        />
      ) : null}

      {creatingTemplate ? (
        <CreateTemplateModal
          onClose={() => setCreatingTemplate(false)}
          onCreated={(tplId) => {
            setCreatingTemplate(false);
            setTemplateEditorId(tplId);
            void refreshAll();
          }}
        />
      ) : null}

      {creatingTask ? (
        <CreateTaskModal
          onClose={() => setCreatingTask(false)}
          onCreated={() => {
            setCreatingTask(false);
            void refreshAll();
          }}
        />
      ) : null}
    </div>
  );
}

// ============================================================================
// LEFT COLUMN
// ============================================================================

function TemplateCard({
  template,
  canEdit,
  onEdit,
  onLaunch,
}: {
  template: WorkflowTemplateSummaryDto;
  canEdit: boolean;
  onEdit: () => void;
  onLaunch: () => void;
}) {
  const { t } = useI18n();
  const color = template.color || "#2563eb";
  return (
    <div
      className="group/template-card relative rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm transition hover:-translate-y-[1px] hover:border-blue-300 hover:shadow-md"
      style={{ borderInlineStartWidth: 4, borderInlineStartColor: color }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-black text-slate-950">{template.title}</p>
          <p className="mt-0.5 text-[11px] font-bold text-slate-500">
            {template.item_count} {t("workflows.page.left.tasksLabel")} · {template.total_minutes}&apos;
          </p>
        </div>
        <span
          className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-white"
          style={{ background: color }}
          aria-hidden
        >
          <Workflow className="h-3.5 w-3.5" aria-hidden />
        </span>
      </div>
      <div className="mt-2 flex items-center gap-1">
        <button
          type="button"
          onClick={onLaunch}
          className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-slate-900 px-2 py-1.5 text-[11px] font-black text-white transition hover:bg-slate-800"
        >
          <Play className="h-3 w-3" aria-hidden />
          {t("workflows.page.left.launch")}
        </button>
        {canEdit ? (
          <button
            type="button"
            onClick={onEdit}
            className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500 transition hover:bg-slate-50"
            aria-label={t("workflows.page.left.edit")}
          >
            <Edit3 className="h-3.5 w-3.5" aria-hidden />
          </button>
        ) : null}
      </div>
    </div>
  );
}

// ============================================================================
// RIGHT COLUMN
// ============================================================================

function TaskLibraryCard({ task }: { task: WorkflowTaskDto }) {
  const { t } = useI18n();
  const color = task.color || "#64748b";
  return (
    <div
      className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-sm transition hover:-translate-y-[1px] hover:border-violet-300 hover:shadow-md"
      title={task.description ?? task.title}
    >
      <span
        className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-white"
        style={{ background: color }}
        aria-hidden
      >
        <Timer className="h-3.5 w-3.5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-black text-slate-950">{task.title}</p>
        <p className="text-[10px] font-bold text-slate-500">
          {task.estimated_minutes}&apos;{" "}
          {task.require_late_reason ? "· " + t("workflows.page.right.requiresReason") : ""}
        </p>
      </div>
    </div>
  );
}

// ============================================================================
// SHARED UI BLOCKS
// ============================================================================

function StatCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: ReactNode;
  icon: typeof Play;
  tone: keyof typeof STATS_TONE;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-2 rounded-2xl border px-3 py-2 shadow-sm ${STATS_TONE[tone]}`}
    >
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-wider opacity-80">
          {label}
        </p>
        <p className="mt-0.5 text-lg font-black tabular-nums md:text-xl">{value}</p>
      </div>
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/60">
        <Icon className="h-4 w-4" aria-hidden />
      </span>
    </div>
  );
}

function SearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative">
      <Search
        className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
        aria-hidden
      />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-9 w-full rounded-xl border border-slate-200 bg-slate-50 ps-9 pe-3 text-xs font-bold text-slate-900 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-200"
      />
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-6 text-center text-xs font-bold text-slate-500">
      {text}
    </p>
  );
}

// ============================================================================
// LIVE RUN PANEL — the center column
// ============================================================================

function LiveRunPanel({
  activeRuns,
  selectedRunId,
  onSelect,
  run,
  now,
  canManage,
  onLaunch,
  onChanged,
  onToast,
}: {
  activeRuns: WorkflowRunSummaryDto[];
  selectedRunId: string | null;
  onSelect: (id: string) => void;
  run: WorkflowRunDetailDto | null;
  now: number;
  canManage: boolean;
  onLaunch: () => void;
  onChanged: () => void;
  onToast: (a: { tone: "success" | "info" | "warning" | "error"; title: string; description?: string }) => void;
}) {
  const { t } = useI18n();
  const [lateModal, setLateModal] = useState<{
    item: WorkflowRunItemDto;
    reason: string;
    submitting: boolean;
    error: string | null;
  } | null>(null);
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const [busyRun, setBusyRun] = useState(false);

  const callItem = useCallback(
    async (
      item: WorkflowRunItemDto,
      action: "start" | "complete" | "skip",
      lateReason?: string,
    ) => {
      if (!run) return null;
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
        if (!json) {
          onToast({ tone: "error", title: t("workflows.runner.toast.serverError") });
          return null;
        }
        if (!json.ok) {
          if (json.code === "LATE_REASON_REQUIRED") {
            setLateModal({ item, reason: "", submitting: false, error: json.error ?? null });
            return null;
          }
          onToast({
            tone: "error",
            title: t("workflows.runner.toast.actionFailed"),
            description: json.error,
          });
          return null;
        }
        if (action === "start")
          onToast({
            tone: "info",
            title: t("workflows.runner.toast.started"),
            description: item.title,
          });
        else if (action === "complete")
          onToast({
            tone: "success",
            title: t("workflows.runner.toast.completed"),
            description: item.title,
          });
        else if (action === "skip")
          onToast({
            tone: "warning",
            title: t("workflows.runner.toast.skipped"),
            description: item.title,
          });
        onChanged();
        return json.data;
      } finally {
        setBusyItemId(null);
      }
    },
    [run, onChanged, onToast, t],
  );

  const submitLate = async () => {
    if (!lateModal) return;
    const reason = lateModal.reason.trim();
    if (!reason) {
      setLateModal({ ...lateModal, error: t("workflows.runner.lateReasonRequired") });
      return;
    }
    setLateModal({ ...lateModal, submitting: true, error: null });
    const result = await callItem(lateModal.item, "complete", reason);
    if (result) setLateModal(null);
    else setLateModal((prev) => (prev ? { ...prev, submitting: false } : prev));
  };

  const abortRun = async () => {
    if (!run) return;
    if (!window.confirm(t("workflows.runner.confirmAbort"))) return;
    setBusyRun(true);
    try {
      const res = await fetch(`/api/workflows/runs/${encodeURIComponent(run.id)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "abort" }),
        credentials: "same-origin",
      });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (json?.ok) {
        onToast({ tone: "info", title: t("workflows.runner.toast.aborted") });
        onChanged();
      } else {
        onToast({
          tone: "error",
          title: t("workflows.runner.toast.abortFailed"),
          description: json?.error,
        });
      }
    } finally {
      setBusyRun(false);
    }
  };

  if (activeRuns.length === 0 && !run) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-slate-400">
          <Workflow className="h-6 w-6" aria-hidden />
        </span>
        <h3 className="text-base font-black text-slate-950">
          {t("workflows.page.center.emptyTitle")}
        </h3>
        <p className="max-w-xs text-xs text-slate-500">
          {t("workflows.page.center.emptyBody")}
        </p>
        {canManage ? (
          <button
            type="button"
            onClick={onLaunch}
            className="inline-flex items-center gap-2 rounded-xl bg-[#2563eb] px-3 py-2 text-xs font-black text-white shadow-sm hover:bg-blue-700"
          >
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            {t("workflows.page.center.launchCta")}
          </button>
        ) : null}
      </div>
    );
  }

  if (!run) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" aria-hidden />
      </div>
    );
  }

  const completedCount = run.items.filter(
    (i) => i.status === "COMPLETED" || i.status === "SKIPPED",
  ).length;
  const pct =
    run.item_count > 0 ? Math.round((completedCount / run.item_count) * 100) : 0;
  const activeItem = run.items.find((i) => i.status === "ACTIVE") ?? null;
  const lateCount = run.items.filter((i) => i.is_late).length;
  const allDone = pct >= 100;

  return (
    <div className="flex h-full flex-col">
      {/* HEADER */}
      <header className="flex items-start justify-between gap-3 border-b border-slate-200 p-3 md:p-4">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-wider text-blue-700">
            {t("workflows.page.center.runKicker")}
          </p>
          <h3 className="mt-0.5 truncate text-base font-black text-slate-950 md:text-lg">
            {run.title}
          </h3>
          <p className="mt-0.5 truncate text-xs font-bold text-slate-500">
            <Users className="me-1 inline h-3 w-3" aria-hidden />
            {run.assignee_name} ·{" "}
            <Calendar className="me-1 inline h-3 w-3" aria-hidden />
            {new Date(run.started_at).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </div>
        <RunStatusBadge status={run.status} late={lateCount > 0} />
      </header>

      {/* SELECTOR: switch between active runs */}
      {activeRuns.length > 1 ? (
        <div className="flex flex-wrap gap-1.5 border-b border-slate-100 px-3 py-2">
          {activeRuns.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => onSelect(r.id)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-black transition ${
                r.id === selectedRunId
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              {r.assignee_name} · {r.completed_count}/{r.item_count}
            </button>
          ))}
        </div>
      ) : null}

      {/* TIMER BOX + ACTIVE TASK CARD */}
      <div className="grid gap-3 p-3 md:grid-cols-[260px_1fr] md:p-4">
        <TimerBox item={activeItem} now={now} />
        <ActiveTaskCard
          item={activeItem}
          totalSteps={run.item_count}
          now={now}
          onComplete={
            activeItem
              ? () => callItem(activeItem, "complete")
              : undefined
          }
          busy={busyItemId === activeItem?.id}
        />
      </div>

      {/* STEPS FLOW */}
      <div className="px-3 pb-2 md:px-4">
        <p className="mb-2 flex items-center justify-between text-[11px] font-black uppercase tracking-wider text-slate-500">
          <span>{t("workflows.page.center.stepsTitle")}</span>
          <span>
            {completedCount}/{run.item_count} · {pct}%
          </span>
        </p>
        <div
          className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100"
          aria-hidden
        >
          <div
            className={`h-full rounded-full transition-[width] duration-500 ${
              allDone
                ? "bg-emerald-500"
                : lateCount > 0
                  ? "bg-rose-500 wf-progress-stripes"
                  : "bg-blue-500 wf-progress-stripes"
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
      <ol className="mt-1 flex-1 space-y-1 overflow-y-auto px-3 pb-3 md:px-4">
        {run.items.map((it) => {
          const elapsed = itemElapsedMs(it.started_at, it.completed_at, now);
          const isLateLive =
            it.status === "ACTIVE"
              ? itemIsLate(it.estimated_minutes, it.started_at, null, now)
              : it.is_late;
          const canStart =
            run.status === "IN_PROGRESS" &&
            it.status === "PENDING" &&
            !run.items.some((other) => other.status === "ACTIVE") &&
            !run.items.some(
              (other) =>
                other.order_index < it.order_index &&
                other.status !== "COMPLETED" &&
                other.status !== "SKIPPED",
            );
          return (
            <StepRow
              key={it.id}
              item={it}
              elapsedMs={elapsed}
              isLateLive={isLateLive}
              busy={busyItemId === it.id}
              canStart={canStart}
              onStart={() => callItem(it, "start")}
              onComplete={() => callItem(it, "complete")}
              onSkip={canManage ? () => callItem(it, "skip") : undefined}
            />
          );
        })}
      </ol>

      {/* FOOTER */}
      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 p-3 md:p-4">
        <div className="text-xs font-bold text-slate-500">
          {run.notes ? `📝 ${run.notes}` : t("workflows.page.center.footerHint")}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {activeItem ? (
            <button
              type="button"
              onClick={() => activeItem && callItem(activeItem, "complete")}
              disabled={busyItemId === activeItem.id}
              className="inline-flex items-center gap-2 rounded-xl bg-[#16a34a] px-4 py-2 text-sm font-black text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
            >
              {busyItemId === activeItem.id ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Check className="h-4 w-4" aria-hidden />
              )}
              {t("workflows.page.center.completeStep")}
            </button>
          ) : null}
          {run.status === "IN_PROGRESS" ? (
            <button
              type="button"
              onClick={abortRun}
              disabled={busyRun}
              className="inline-flex items-center gap-2 rounded-xl border border-rose-300 bg-white px-3 py-2 text-xs font-bold text-rose-700 transition hover:bg-rose-50 disabled:opacity-50"
            >
              {busyRun ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Square className="h-3.5 w-3.5" aria-hidden />}
              {t("workflows.page.center.endGroup")}
            </button>
          ) : null}
        </div>
      </footer>

      {lateModal ? (
        <LateReasonModal
          state={lateModal}
          onChange={(reason) =>
            setLateModal((prev) => (prev ? { ...prev, reason, error: null } : prev))
          }
          onSubmit={() => void submitLate()}
          onClose={() => setLateModal(null)}
        />
      ) : null}
    </div>
  );
}

function RunStatusBadge({
  status,
  late,
}: {
  status: WorkflowRunStatus;
  late: boolean;
}) {
  const { t } = useI18n();
  if (status === "COMPLETED") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-black text-emerald-800">
        <CheckCircle2 className="h-3 w-3" aria-hidden />
        {t("workflows.page.badge.completed")}
      </span>
    );
  }
  if (status === "ABORTED") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-2.5 py-1 text-[11px] font-black text-slate-700">
        <X className="h-3 w-3" aria-hidden />
        {t("workflows.page.badge.aborted")}
      </span>
    );
  }
  if (late) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-1 text-[11px] font-black text-rose-800">
        <AlertTriangle className="h-3 w-3" aria-hidden />
        {t("workflows.page.badge.late")}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-1 text-[11px] font-black text-blue-800">
      <Play className="h-3 w-3" aria-hidden />
      {t("workflows.page.badge.inProgress")}
    </span>
  );
}

function TimerBox({
  item,
  now,
}: {
  item: WorkflowRunItemDto | null;
  now: number;
}) {
  const { t } = useI18n();
  if (!item) {
    return (
      <div className="grid place-items-center rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <Pause className="h-6 w-6 text-slate-400" aria-hidden />
        <p className="mt-1 text-xs font-bold text-slate-500">
          {t("workflows.page.center.timerIdle")}
        </p>
      </div>
    );
  }
  const elapsed = itemElapsedMs(item.started_at, item.completed_at, now) ?? 0;
  const targetMs = item.estimated_minutes * 60_000;
  const remaining = targetMs - elapsed;
  const isLate = item.estimated_minutes > 0 && remaining < 0;
  const display = isLate
    ? `+${formatHMS(Math.abs(remaining))}`
    : formatHMS(Math.max(0, remaining));

  return (
    <div
      className={`relative overflow-hidden rounded-2xl p-3 text-white shadow-md ${
        isLate ? "bg-[#dc2626] wf-pulse-late" : "bg-[#0f172a] wf-pulse"
      }`}
    >
      <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider opacity-80">
        <span>{isLate ? t("workflows.page.center.timerLate") : t("workflows.page.center.timerLabel")}</span>
        <span>{t("workflows.page.center.timerTarget", { n: item.estimated_minutes })}</span>
      </div>
      <div className="mt-1 text-center text-4xl font-black tabular-nums leading-none md:text-5xl">
        {display}
      </div>
      <div className="mt-2 text-center text-[11px] font-bold opacity-90">
        {t("workflows.page.center.timerElapsed", { time: formatHMS(elapsed) })}
      </div>
    </div>
  );
}

function ActiveTaskCard({
  item,
  totalSteps,
  now,
  onComplete,
  busy,
}: {
  item: WorkflowRunItemDto | null;
  totalSteps: number;
  now: number;
  onComplete?: () => void;
  busy: boolean;
}) {
  const { t } = useI18n();
  if (!item) {
    return (
      <div className="grid place-items-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-xs font-bold text-slate-500">
        {t("workflows.page.center.noActive")}
      </div>
    );
  }
  const isLateLive = itemIsLate(item.estimated_minutes, item.started_at, null, now);
  const color = item.color || "#2563eb";
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border-2 p-3 shadow-sm ${
        isLateLive ? "border-rose-300 bg-rose-50" : "border-blue-300 bg-blue-50/70"
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          className="grid h-12 w-12 shrink-0 place-items-center rounded-xl text-white shadow-sm"
          style={{ background: color }}
          aria-hidden
        >
          <Play className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">
            {t("workflows.page.center.stepKicker", { idx: item.order_index + 1, n: totalSteps })}
          </p>
          <p className="mt-0.5 truncate text-sm font-black text-slate-950 md:text-base">
            {item.title}
          </p>
          {item.description ? (
            <p className="mt-0.5 line-clamp-2 text-xs text-slate-600">{item.description}</p>
          ) : null}
          <div className="mt-1 flex flex-wrap gap-1">
            <span className="inline-flex items-center gap-1 rounded-md bg-white/80 px-2 py-0.5 text-[10px] font-bold text-slate-700">
              <Timer className="h-3 w-3" aria-hidden />
              {t("workflows.page.center.estim", { n: item.estimated_minutes })}
            </span>
            {isLateLive ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-rose-200 px-2 py-0.5 text-[10px] font-bold text-rose-900">
                <AlertTriangle className="h-3 w-3" aria-hidden />
                {t("workflows.page.center.late")}
              </span>
            ) : null}
          </div>
        </div>
        {onComplete ? (
          <button
            type="button"
            onClick={onComplete}
            disabled={busy}
            className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-[#16a34a] px-3 py-2 text-xs font-black text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Check className="h-3.5 w-3.5" aria-hidden />}
            {t("workflows.page.center.done")}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function StepRow({
  item,
  elapsedMs,
  isLateLive,
  busy,
  canStart,
  onStart,
  onComplete,
  onSkip,
}: {
  item: WorkflowRunItemDto;
  elapsedMs: number | null;
  isLateLive: boolean;
  busy: boolean;
  canStart: boolean;
  onStart: () => void;
  onComplete: () => void;
  onSkip?: () => void;
}) {
  const { t } = useI18n();
  const isCompleted = item.status === "COMPLETED";
  const isSkipped = item.status === "SKIPPED";
  const isActive = item.status === "ACTIVE";

  const circleClass = isCompleted
    ? "bg-[#16a34a] text-white"
    : isActive
      ? isLateLive
        ? "bg-[#dc2626] text-white ring-4 ring-rose-200"
        : "bg-[#2563eb] text-white ring-4 ring-blue-200"
      : isSkipped
        ? "bg-slate-300 text-slate-600"
        : "bg-white text-slate-400 ring-2 ring-slate-200";

  const rowState = isCompleted
    ? "is-completed"
    : isActive
      ? "is-active"
      : "";

  return (
    <li
      className={`wf-step-row ${rowState} flex items-start gap-3 rounded-xl px-1 py-1 transition ${
        isActive ? "bg-blue-50/40" : ""
      }`}
    >
      <span
        className={`mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-black transition ${circleClass}`}
      >
        {isCompleted ? (
          <Check className="h-4 w-4" aria-hidden />
        ) : isActive ? (
          isLateLive ? (
            <AlertTriangle className="h-4 w-4" aria-hidden />
          ) : (
            <Play className="h-4 w-4" aria-hidden />
          )
        ) : isSkipped ? (
          <ChevronRight className="h-4 w-4" aria-hidden />
        ) : (
          <span className="tabular-nums">{item.order_index + 1}</span>
        )}
      </span>
      <div className="min-w-0 flex-1 py-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <p
            className={`text-sm font-black ${
              isCompleted && !item.is_late
                ? "text-emerald-800 line-through decoration-emerald-300"
                : "text-slate-950"
            }`}
          >
            {item.title}
          </p>
          <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-700">
            <Timer className="h-3 w-3" aria-hidden />
            {t("workflows.page.steps.target", { n: item.estimated_minutes })}
          </span>
          {item.status !== "PENDING" && elapsedMs != null ? (
            <span
              className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
                isLateLive
                  ? "bg-rose-100 text-rose-800"
                  : "bg-emerald-100 text-emerald-800"
              }`}
            >
              {formatHMS(elapsedMs)}
            </span>
          ) : null}
          {item.is_late ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-800">
              <AlertTriangle className="h-3 w-3" aria-hidden />
              {t("workflows.page.steps.late")}
            </span>
          ) : null}
          {item.actual_minutes != null && isCompleted ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-700">
              <Flag className="h-3 w-3" aria-hidden />
              {t("workflows.page.steps.actual", { n: item.actual_minutes })}
            </span>
          ) : null}
        </div>
        {item.late_reason ? (
          <p className="mt-0.5 line-clamp-1 text-[11px] font-bold text-rose-700" title={item.late_reason}>
            ⚠ {item.late_reason}
          </p>
        ) : null}
      </div>
      <div className="shrink-0">
        {item.status === "PENDING" ? (
          <button
            type="button"
            onClick={onStart}
            disabled={!canStart || busy}
            className="inline-flex items-center gap-1 rounded-lg bg-[#2563eb] px-2.5 py-1.5 text-[11px] font-black text-white shadow-sm transition hover:bg-blue-700 disabled:bg-slate-100 disabled:text-slate-400"
          >
            {busy ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <Play className="h-3 w-3" aria-hidden />}
            {t("workflows.page.steps.start")}
          </button>
        ) : isActive ? (
          <button
            type="button"
            onClick={onComplete}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded-lg bg-[#16a34a] px-2.5 py-1.5 text-[11px] font-black text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <Check className="h-3 w-3" aria-hidden />}
            {t("workflows.page.steps.complete")}
          </button>
        ) : item.status !== "COMPLETED" && onSkip ? (
          <button
            type="button"
            onClick={onSkip}
            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold text-slate-500 transition hover:bg-slate-50"
          >
            {t("workflows.page.steps.skip")}
          </button>
        ) : null}
      </div>
    </li>
  );
}

// ============================================================================
// RECENT RUNS TABLE
// ============================================================================

function RecentRunsTable({
  activeRuns,
  recentRuns,
  onOpen,
}: {
  activeRuns: WorkflowRunSummaryDto[];
  recentRuns: WorkflowRunSummaryDto[];
  onOpen: (id: string) => void;
}) {
  const { t } = useI18n();
  const combined: WorkflowRunSummaryDto[] = [
    ...activeRuns,
    ...recentRuns.filter((r) => !activeRuns.some((a) => a.id === r.id)),
  ];

  if (combined.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-6 text-center text-sm font-bold text-slate-500">
        {t("workflows.page.history.empty")}
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-[11px] font-black uppercase tracking-wider text-slate-500">
            <th className="px-2 py-2 text-start">{t("workflows.page.history.col.group")}</th>
            <th className="px-2 py-2 text-start">{t("workflows.page.history.col.employee")}</th>
            <th className="px-2 py-2 text-start">{t("workflows.page.history.col.start")}</th>
            <th className="px-2 py-2 text-start">{t("workflows.page.history.col.end")}</th>
            <th className="px-2 py-2 text-start">{t("workflows.page.history.col.time")}</th>
            <th className="px-2 py-2 text-start">{t("workflows.page.history.col.progress")}</th>
            <th className="px-2 py-2 text-start">{t("workflows.page.history.col.status")}</th>
            <th className="px-2 py-2 text-start" aria-label="open" />
          </tr>
        </thead>
        <tbody>
          {combined.map((r) => {
            const pct =
              r.item_count > 0 ? Math.round((r.completed_count / r.item_count) * 100) : 0;
            return (
              <tr
                key={r.id}
                className="border-b border-slate-100 transition hover:bg-slate-50"
              >
                <td className="px-2 py-2">
                  <p className="font-black text-slate-950">{r.title}</p>
                  {r.template_title ? (
                    <p className="text-[10px] font-bold text-slate-500">
                      {r.template_title}
                    </p>
                  ) : null}
                </td>
                <td className="px-2 py-2 font-bold text-slate-700">{r.assignee_name}</td>
                <td className="px-2 py-2 text-xs text-slate-600 tabular-nums">
                  {new Date(r.started_at).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </td>
                <td className="px-2 py-2 text-xs text-slate-600 tabular-nums">
                  {r.completed_at
                    ? new Date(r.completed_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "—"}
                </td>
                <td className="px-2 py-2 text-xs font-bold tabular-nums text-slate-700">
                  {r.total_estimated_minutes}&apos;
                </td>
                <td className="px-2 py-2">
                  <div className="flex w-32 items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full ${
                          r.late_count > 0
                            ? "bg-rose-500"
                            : r.status === "COMPLETED"
                              ? "bg-emerald-500"
                              : "bg-blue-500"
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-[10px] font-black text-slate-600 tabular-nums">
                      {pct}%
                    </span>
                  </div>
                </td>
                <td className="px-2 py-2">
                  <RunStatusBadge
                    status={r.status}
                    late={r.late_count > 0 && r.status === "IN_PROGRESS"}
                  />
                </td>
                <td className="px-2 py-2">
                  <button
                    type="button"
                    onClick={() => onOpen(r.id)}
                    className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-700 transition hover:bg-slate-200"
                  >
                    {t("workflows.page.history.open")}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================================
// LAUNCH RUN MODAL
// ============================================================================

function LaunchRunModal({
  employees,
  templates,
  preselectedTemplateId,
  canSelectAssignee,
  selfId,
  onClose,
  onLaunched,
}: {
  employees: WorkflowEmployeeOption[];
  templates: WorkflowTemplateSummaryDto[];
  preselectedTemplateId: string | null;
  canSelectAssignee: boolean;
  selfId: string | null;
  onClose: () => void;
  onLaunched: (runId: string) => void;
}) {
  const { t, dir } = useI18n();
  const { showToast } = useToast();
  const validTemplates = useMemo(
    () => templates.filter((tt) => !tt.archived_at && tt.item_count > 0),
    [templates],
  );
  const [templateId, setTemplateId] = useState(
    preselectedTemplateId ?? validTemplates[0]?.id ?? "",
  );
  const [assigneeId, setAssigneeId] = useState(canSelectAssignee ? "" : selfId ?? "");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    const tid = templateId.trim();
    const aid = (assigneeId || selfId || "").trim();
    if (!tid || !aid) {
      showToast({ tone: "warning", title: t("workflows.launcher.errRequired") });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/workflows/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId: tid, assigneeId: aid, notes: notes.trim() || null }),
        credentials: "same-origin",
      });
      const json = (await res.json().catch(() => null)) as
        | { ok: true; data: WorkflowRunDetailDto }
        | { ok: false; error?: string }
        | null;
      if (!json || !json.ok) {
        showToast({
          tone: "error",
          title: t("workflows.launcher.errCreate"),
          description: (json && !json.ok ? json.error : undefined) ?? "",
        });
        return;
      }
      showToast({
        tone: "success",
        title: t("workflows.launcher.toastLaunched"),
        description: json.data.title,
      });
      onLaunched(json.data.id);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal dir={dir} onClose={onClose} title={t("workflows.launcher.title")}>
      <div className="space-y-3">
        <label className="block text-xs font-bold text-slate-700">
          {t("workflows.launcher.template")}
          <select
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            className="mt-1 block h-10 w-full rounded-xl border border-slate-300 px-3 text-sm shadow-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-200"
          >
            {validTemplates.length === 0 ? (
              <option value="">{t("workflows.launcher.noTemplates")}</option>
            ) : null}
            {validTemplates.map((tt) => (
              <option key={tt.id} value={tt.id}>
                {tt.title} · {tt.item_count} · {tt.total_minutes}&apos;
              </option>
            ))}
          </select>
        </label>
        {canSelectAssignee ? (
          <label className="block text-xs font-bold text-slate-700">
            {t("workflows.launcher.assignee")}
            <select
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
              className="mt-1 block h-10 w-full rounded-xl border border-slate-300 px-3 text-sm shadow-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-200"
            >
              <option value="">{t("workflows.launcher.pickAssignee")}</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.fullName} — {e.email}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="block text-xs font-bold text-slate-700">
          {t("workflows.launcher.notes")}
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-200"
            placeholder={t("workflows.launcher.notesPlaceholder")}
          />
        </label>
      </div>
      <ModalFooter>
        <button
          type="button"
          onClick={onClose}
          disabled={submitting}
          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {t("common.cancel")}
        </button>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={submitting || validTemplates.length === 0}
          className="inline-flex items-center gap-2 rounded-xl bg-[#2563eb] px-4 py-2 text-sm font-black text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}
          {t("workflows.launcher.start")}
        </button>
      </ModalFooter>
    </Modal>
  );
}

// ============================================================================
// TEMPLATE EDITOR MODAL
// ============================================================================

function TemplateEditorModal({
  templateId,
  tasks,
  canEdit,
  onClose,
  onChanged,
}: {
  templateId: string;
  tasks: WorkflowTaskDto[];
  canEdit: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { t, dir } = useI18n();
  const { showToast } = useToast();
  const [tpl, setTpl] = useState<WorkflowTemplateDetailDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [taskToAdd, setTaskToAdd] = useState("");
  const [savingMeta, setSavingMeta] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftColor, setDraftColor] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/workflows/templates/${encodeURIComponent(templateId)}`, {
      credentials: "same-origin",
    });
    const json = (await res.json().catch(() => null)) as
      | { ok: true; data: WorkflowTemplateDetailDto }
      | null;
    if (json?.ok) {
      setTpl(json.data);
      setDraftTitle(json.data.title);
      setDraftDescription(json.data.description ?? "");
      setDraftColor(json.data.color ?? "");
    }
    setLoading(false);
  }, [templateId]);

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, [load]);

  const addItem = async () => {
    if (!taskToAdd) return;
    const res = await fetch(
      `/api/workflows/templates/${encodeURIComponent(templateId)}/items`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: taskToAdd }),
        credentials: "same-origin",
      },
    );
    const json = (await res.json().catch(() => null)) as
      | { ok: true; data: WorkflowTemplateDetailDto }
      | { ok: false; error?: string }
      | null;
    if (json?.ok) {
      setTpl(json.data);
      setTaskToAdd("");
      onChanged();
    } else {
      showToast({
        tone: "error",
        title: t("workflows.templates.errAddItem"),
        description: (json && !json.ok ? json.error : undefined) ?? "",
      });
    }
  };

  const reorder = async (id: string, direction: -1 | 1) => {
    if (!tpl) return;
    const arr = tpl.items.map((i) => i.id);
    const idx = arr.indexOf(id);
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
    if (json?.ok) {
      setTpl(json.data);
      onChanged();
    }
  };

  const removeItem = async (id: string) => {
    const res = await fetch(
      `/api/workflows/templates/${encodeURIComponent(templateId)}/items/${encodeURIComponent(id)}`,
      { method: "DELETE", credentials: "same-origin" },
    );
    const json = (await res.json().catch(() => null)) as
      | { ok: true; data: WorkflowTemplateDetailDto }
      | null;
    if (json?.ok) {
      setTpl(json.data);
      onChanged();
    }
  };

  const overrideMinutes = async (id: string, value: string) => {
    const n = value === "" ? null : Number(value);
    if (n != null && (!Number.isFinite(n) || n < 0)) return;
    const res = await fetch(
      `/api/workflows/templates/${encodeURIComponent(templateId)}/items/${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ minutesOverride: n }),
        credentials: "same-origin",
      },
    );
    const json = (await res.json().catch(() => null)) as
      | { ok: true; data: WorkflowTemplateDetailDto }
      | null;
    if (json?.ok) setTpl(json.data);
  };

  const saveMeta = async () => {
    setSavingMeta(true);
    try {
      const res = await fetch(`/api/workflows/templates/${encodeURIComponent(templateId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: draftTitle.trim(),
          description: draftDescription.trim() || null,
          color: draftColor.trim() || null,
        }),
        credentials: "same-origin",
      });
      const json = (await res.json().catch(() => null)) as
        | { ok: true; data: WorkflowTemplateDetailDto }
        | { ok: false; error?: string }
        | null;
      if (json?.ok) {
        setTpl(json.data);
        showToast({ tone: "success", title: t("workflows.templates.toastSaved") });
        onChanged();
      } else {
        showToast({
          tone: "error",
          title: t("workflows.templates.errSave"),
          description: (json && !json.ok ? json.error : undefined) ?? "",
        });
      }
    } finally {
      setSavingMeta(false);
    }
  };

  const duplicate = async () => {
    if (!tpl) return;
    const res = await fetch(`/api/workflows/templates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: `${tpl.title} — ${t("workflows.templates.copySuffix")}`,
        duplicateFromId: tpl.id,
        color: tpl.color,
      }),
      credentials: "same-origin",
    });
    const json = (await res.json().catch(() => null)) as
      | { ok: true; data: WorkflowTemplateDetailDto }
      | null;
    if (json?.ok) {
      showToast({ tone: "success", title: t("workflows.templates.toastDuplicated") });
      onChanged();
    }
  };

  const remove = async () => {
    if (!tpl) return;
    if (!window.confirm(t("workflows.templates.confirmDelete", { name: tpl.title }))) return;
    const res = await fetch(`/api/workflows/templates/${encodeURIComponent(tpl.id)}`, {
      method: "DELETE",
      credentials: "same-origin",
    });
    const json = (await res.json().catch(() => null)) as
      | { ok: boolean; archived?: boolean; error?: string }
      | null;
    if (json?.ok) {
      showToast({
        tone: "info",
        title: json.archived
          ? t("workflows.templates.toastArchived")
          : t("workflows.templates.toastDeleted"),
      });
      onChanged();
      onClose();
    } else {
      showToast({
        tone: "error",
        title: t("workflows.templates.errDelete"),
        description: json?.error,
      });
    }
  };

  return (
    <Modal dir={dir} onClose={onClose} title={tpl?.title ?? t("workflows.templates.editorLoading")}>
      {loading || !tpl ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" aria-hidden />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-2 md:grid-cols-3">
            <label className="block text-xs font-bold text-slate-700 md:col-span-2">
              {t("workflows.templates.fieldTitle")}
              <input
                type="text"
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                disabled={!canEdit}
                className="mt-1 block h-10 w-full rounded-xl border border-slate-300 px-3 text-sm shadow-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-200 disabled:opacity-60"
              />
            </label>
            <label className="block text-xs font-bold text-slate-700">
              {t("workflows.templates.fieldColor")}
              <input
                type="color"
                value={draftColor || "#2563eb"}
                onChange={(e) => setDraftColor(e.target.value)}
                disabled={!canEdit}
                className="mt-1 h-10 w-full cursor-pointer rounded-xl border border-slate-300 disabled:opacity-60"
              />
            </label>
            <label className="block text-xs font-bold text-slate-700 md:col-span-3">
              {t("workflows.templates.fieldDescription")}
              <textarea
                value={draftDescription}
                onChange={(e) => setDraftDescription(e.target.value)}
                disabled={!canEdit}
                rows={2}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-200 disabled:opacity-60"
              />
            </label>
          </div>
          {canEdit ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void duplicate()}
                  className="inline-flex items-center gap-1 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
                >
                  <Copy className="h-3.5 w-3.5" aria-hidden />
                  {t("workflows.templates.duplicate")}
                </button>
                <button
                  type="button"
                  onClick={() => void remove()}
                  className="inline-flex items-center gap-1 rounded-xl border border-rose-200 bg-white px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-50"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  {t("workflows.templates.deleteShort")}
                </button>
              </div>
              <button
                type="button"
                onClick={() => void saveMeta()}
                disabled={savingMeta}
                className="inline-flex items-center gap-2 rounded-xl bg-[#16a34a] px-4 py-1.5 text-xs font-black text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
              >
                {savingMeta ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Check className="h-3.5 w-3.5" aria-hidden />}
                {t("common.save")}
              </button>
            </div>
          ) : null}

          <hr className="border-slate-200" />

          {canEdit ? (
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={taskToAdd}
                onChange={(e) => setTaskToAdd(e.target.value)}
                className="h-10 min-w-[220px] flex-1 rounded-xl border border-slate-300 px-3 text-sm shadow-sm focus:border-violet-400 focus:ring-2 focus:ring-violet-200"
              >
                <option value="">{t("workflows.templates.pickFromLibrary")}</option>
                {tasks
                  .filter((tt) => !tt.archived_at)
                  .map((tt) => (
                    <option key={tt.id} value={tt.id}>
                      {tt.title} · {tt.estimated_minutes}&apos;
                    </option>
                  ))}
              </select>
              <button
                type="button"
                onClick={() => void addItem()}
                disabled={!taskToAdd}
                className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-3 py-2 text-sm font-black text-white shadow-sm hover:bg-violet-700 disabled:opacity-50"
              >
                <Plus className="h-4 w-4" aria-hidden />
                {t("workflows.templates.addItem")}
              </button>
            </div>
          ) : null}

          {tpl.items.length === 0 ? (
            <EmptyHint text={t("workflows.templates.itemsEmpty")} />
          ) : (
            <ol className="space-y-2">
              {tpl.items.map((it, idx) => (
                <li
                  key={it.id}
                  className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-sm"
                >
                  <GripVertical className="h-4 w-4 text-slate-300" aria-hidden />
                  <span
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-xs font-black text-white"
                    style={{ background: it.task_color || "#475569" }}
                  >
                    {idx + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-black text-slate-950">
                      {it.display_title}
                    </p>
                    {it.archived ? (
                      <p className="text-[10px] font-bold text-rose-700">
                        {t("workflows.templates.itemArchivedHint")}
                      </p>
                    ) : null}
                  </div>
                  {canEdit ? (
                    <>
                      <input
                        type="number"
                        min={0}
                        max={480}
                        value={it.minutes_override ?? ""}
                        placeholder={String(it.effective_minutes)}
                        onChange={(e) => void overrideMinutes(it.id, e.target.value)}
                        className="h-8 w-16 rounded-md border border-slate-300 px-2 text-xs tabular-nums focus:border-violet-400 focus:ring-1 focus:ring-violet-200"
                        title={t("workflows.templates.overrideMinutesHint")}
                      />
                      <span className="text-[10px] font-bold text-slate-500">{`'`}</span>
                      <button
                        type="button"
                        onClick={() => void reorder(it.id, -1)}
                        disabled={idx === 0}
                        className="rounded-md p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        onClick={() => void reorder(it.id, 1)}
                        disabled={idx === tpl.items.length - 1}
                        className="rounded-md p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                      >
                        ▼
                      </button>
                      <button
                        type="button"
                        onClick={() => void removeItem(it.id)}
                        className="rounded-md p-1 text-rose-500 hover:bg-rose-50"
                        aria-label={t("workflows.templates.removeItem")}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </button>
                    </>
                  ) : (
                    <span className="text-xs font-bold text-slate-500 tabular-nums">
                      {it.effective_minutes}&apos;
                    </span>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </Modal>
  );
}

// ============================================================================
// CREATE TEMPLATE / TASK MODALS
// ============================================================================

function CreateTemplateModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { t, dir } = useI18n();
  const { showToast } = useToast();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(COLOR_PRESETS[0]);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const tt = title.trim();
    if (!tt) {
      showToast({ tone: "warning", title: t("workflows.templates.errEmptyTitle") });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/workflows/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: tt, description: description.trim() || null, color }),
        credentials: "same-origin",
      });
      const json = (await res.json().catch(() => null)) as
        | { ok: true; data: WorkflowTemplateDetailDto }
        | { ok: false; error?: string }
        | null;
      if (!json || !json.ok) {
        showToast({
          tone: "error",
          title: t("workflows.templates.errCreate"),
          description: (json && !json.ok ? json.error : undefined) ?? "",
        });
        return;
      }
      showToast({ tone: "success", title: t("workflows.templates.toastCreated") });
      onCreated(json.data.id);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal dir={dir} onClose={onClose} title={t("workflows.templates.new")}>
      <div className="space-y-3">
        <label className="block text-xs font-bold text-slate-700">
          {t("workflows.templates.fieldTitle")}
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
            placeholder={t("workflows.templates.titlePlaceholder")}
            className="mt-1 block h-10 w-full rounded-xl border border-slate-300 px-3 text-sm shadow-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-200"
          />
        </label>
        <label className="block text-xs font-bold text-slate-700">
          {t("workflows.templates.fieldDescription")}
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-200"
          />
        </label>
        <div>
          <p className="text-xs font-bold text-slate-700">
            {t("workflows.templates.fieldColor")}
          </p>
          <div className="mt-1 flex gap-1.5">
            {COLOR_PRESETS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                aria-label={c}
                className={`h-7 w-7 rounded-full border-2 transition ${
                  c === color
                    ? "border-slate-900 ring-2 ring-slate-200"
                    : "border-white"
                }`}
                style={{ background: c }}
              />
            ))}
          </div>
        </div>
      </div>
      <ModalFooter>
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {t("common.cancel")}
        </button>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-xl bg-[#2563eb] px-4 py-2 text-sm font-black text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
          {t("workflows.templates.create")}
        </button>
      </ModalFooter>
    </Modal>
  );
}

function CreateTaskModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const { t, dir } = useI18n();
  const { showToast } = useToast();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [minutes, setMinutes] = useState("10");
  const [color, setColor] = useState(COLOR_PRESETS[0]);
  const [requireLate, setRequireLate] = useState(true);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const tt = title.trim();
    if (!tt) {
      showToast({ tone: "warning", title: t("workflows.library.errEmptyTitle") });
      return;
    }
    const n = Number(minutes);
    if (!Number.isFinite(n) || n < 0 || n > 480) {
      showToast({ tone: "warning", title: t("workflows.library.errBadMinutes") });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/workflows/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: tt,
          description: description.trim() || null,
          estimatedMinutes: n,
          requireLateReason: requireLate,
          color,
        }),
        credentials: "same-origin",
      });
      const json = (await res.json().catch(() => null)) as
        | { ok: true; data: WorkflowTaskDto }
        | { ok: false; error?: string }
        | null;
      if (!json || !json.ok) {
        showToast({
          tone: "error",
          title: t("workflows.library.errCreate"),
          description: (json && !json.ok ? json.error : undefined) ?? "",
        });
        return;
      }
      showToast({ tone: "success", title: t("workflows.library.toastCreated") });
      onCreated();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal dir={dir} onClose={onClose} title={t("workflows.library.new")}>
      <div className="space-y-3">
        <label className="block text-xs font-bold text-slate-700">
          {t("workflows.templates.fieldTitle")}
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
            placeholder={t("workflows.library.titlePlaceholder")}
            className="mt-1 block h-10 w-full rounded-xl border border-slate-300 px-3 text-sm shadow-sm focus:border-violet-400 focus:ring-2 focus:ring-violet-200"
          />
        </label>
        <label className="block text-xs font-bold text-slate-700">
          {t("workflows.library.descriptionPlaceholder")}
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-violet-400 focus:ring-2 focus:ring-violet-200"
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-xs font-bold text-slate-700">
            {t("workflows.page.minutesLabel")}
            <input
              type="number"
              min={0}
              max={480}
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              className="mt-1 block h-10 w-full rounded-xl border border-slate-300 px-3 text-sm tabular-nums shadow-sm focus:border-violet-400 focus:ring-2 focus:ring-violet-200"
            />
          </label>
          <div>
            <p className="text-xs font-bold text-slate-700">
              {t("workflows.templates.fieldColor")}
            </p>
            <div className="mt-1 flex gap-1.5">
              {COLOR_PRESETS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  aria-label={c}
                  className={`h-7 w-7 rounded-full border-2 transition ${
                    c === color
                      ? "border-slate-900 ring-2 ring-slate-200"
                      : "border-white"
                  }`}
                  style={{ background: c }}
                />
              ))}
            </div>
          </div>
        </div>
        <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
          <input
            type="checkbox"
            checked={requireLate}
            onChange={(e) => setRequireLate(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-400"
          />
          {t("workflows.library.requireLateReason")}
        </label>
      </div>
      <ModalFooter>
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {t("common.cancel")}
        </button>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm font-black text-white shadow-sm hover:bg-violet-700 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
          {t("workflows.library.create")}
        </button>
      </ModalFooter>
    </Modal>
  );
}

// ============================================================================
// LATE REASON MODAL
// ============================================================================

function LateReasonModal({
  state,
  onChange,
  onSubmit,
  onClose,
}: {
  state: {
    item: WorkflowRunItemDto;
    reason: string;
    submitting: boolean;
    error: string | null;
  };
  onChange: (reason: string) => void;
  onSubmit: () => void;
  onClose: () => void;
}) {
  const { t, dir } = useI18n();
  return (
    <div
      dir={dir}
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/65 p-4"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget && !state.submitting) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-rose-600" aria-hidden />
          <h3 className="text-lg font-black text-slate-950">
            {t("workflows.runner.lateModalTitle")}
          </h3>
        </div>
        <p className="mt-2 text-sm font-bold text-slate-700">
          {t("workflows.runner.lateModalBody", { name: state.item.title })}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          {t("workflows.runner.lateModalHint", { n: state.item.estimated_minutes })}
        </p>
        <textarea
          value={state.reason}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          autoFocus
          placeholder={t("workflows.runner.lateModalPlaceholder")}
          className="mt-3 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-rose-400 focus:ring-2 focus:ring-rose-200"
        />
        {state.error ? (
          <p className="mt-2 text-xs font-bold text-rose-700">{state.error}</p>
        ) : null}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={state.submitting}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={state.submitting}
            className="inline-flex items-center gap-2 rounded-xl bg-[#dc2626] px-4 py-2 text-sm font-black text-white shadow-sm hover:bg-rose-700 disabled:opacity-50"
          >
            {state.submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}
            {t("workflows.runner.lateModalSubmit")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// MODAL CHROME
// ============================================================================

function Modal({
  children,
  onClose,
  title,
  dir,
}: {
  children: ReactNode;
  onClose: () => void;
  title: string;
  dir: "rtl" | "ltr";
}) {
  return (
    <div
      dir={dir}
      className="fixed inset-0 z-[115] flex items-stretch justify-center bg-black/65 p-0 md:p-4"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex w-full max-w-2xl flex-col overflow-hidden bg-white shadow-2xl md:rounded-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-4 py-3">
          <h3 className="text-base font-black text-slate-950">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-200"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-4">{children}</div>
      </div>
    </div>
  );
}

function ModalFooter({ children }: { children: ReactNode }) {
  return <div className="mt-5 flex justify-end gap-2">{children}</div>;
}

// ============================================================================
// HELPERS
// ============================================================================

function formatHMS(ms: number): string {
  const clamped = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(clamped / 3600);
  const m = Math.floor((clamped % 3600) / 60);
  const s = clamped % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  if (h > 0) return `${String(h).padStart(2, "0")}:${mm}:${ss}`;
  return `${mm}:${ss}`;
}

