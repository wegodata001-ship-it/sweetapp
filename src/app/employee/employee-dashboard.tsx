"use client";

import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Loader2,
  LogOut,
  Sparkles,
  Workflow,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { useI18n } from "@/components/i18n-provider";
import { useToast } from "@/components/toast-provider";
import { useEmployeeMiddayToast } from "@/hooks/use-employee-midday-toast";
import { computeEmployeeTaskDayStats } from "@/lib/employee-experience/task-stats";
import type { EmployeeTaskDayStats } from "@/lib/employee-experience/task-stats";
import {
  writeEmployeeTasksCache,
  type EmployeeTasksCachePayload,
} from "@/lib/work-tasks/my-tasks-client-cache";
import { EMPLOYEE_WORK_SESSION_STARTED_AT_KEY } from "@/lib/employee-experience/storage-keys";
import { EmployeeDailyProgress } from "@/components/employee/employee-daily-progress";
import { EmployeeGreetingHeader } from "@/components/employee/employee-greeting-header";
import { EmployeeLiveStatus } from "@/components/employee/employee-live-status";
import { EmployeeMotivationCard } from "@/components/employee/employee-motivation-card";
import { EmployeeProfileStrip } from "@/components/employee/employee-profile-strip";
import { TodayMinutesLive } from "@/components/employee/today-minutes-live";
import { MyNotesWidget } from "@/components/my-notes/my-notes-widget";
import type { SerializedWorkEmployeeTask } from "@/lib/work-tasks/serialize-work-task";
import { WorkflowRunCard } from "@/components/workflows/workflow-run-card";
import type { WorkflowRunDetailDto } from "@/lib/workflows/serialize";
import type { WorkSessionDto } from "@/lib/work-sessions/serialize";
import { MAX_SHIFT_MINUTES, MAX_SHIFT_MS } from "@/lib/work-sessions/max-shift";

type DashboardData = {
  session: WorkSessionDto | null;
  auto_closed?: boolean;
  today: { sessions: WorkSessionDto[]; completed_minutes: number };
  active_run: WorkflowRunDetailDto | null;
  other_active_run_count: number;
  counts: { open_tasks: number; late_tasks: number; active_runs: number };
};

function fmtHMM(minutes: number): string {
  const m = Math.max(0, Math.floor(minutes));
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h.toString().padStart(2, "0")}:${mm.toString().padStart(2, "0")}`;
}

/**
 * Employee home dashboard.
 *
 * - 4 KPI cards at the top.
 * - "Active task" hero card (live timer derived from `started_at`).
 * - End-of-day "Clock Out" button.
 *
 * State strategy:
 *  - The live minute counter ticks inside TodayMinutesLive, not on this page.
 *  - Dashboard and tasks load in parallel. The page spinner waits only for the dashboard.
 *  - Re-fetch every 30s and on focus to stay honest after sleeps.
 */
export function EmployeeDashboard() {
  const { t, dir, bcp47 } = useI18n();
  const { showToast } = useToast();
  const { user } = useAuth();
  const router = useRouter();

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [clockingOut, setClockingOut] = useState(false);
  const [workTasks, setWorkTasks] = useState<SerializedWorkEmployeeTask[]>([]);
  const [taskStats, setTaskStats] = useState<EmployeeTaskDayStats | null>(null);
  const askedServerToClose = useRef(false);
  const freshUntil = useRef(0);
  const roleRef = useRef(user?.role);
  const userIdRef = useRef(user?.id);
  roleRef.current = user?.role;
  userIdRef.current = user?.id;

  const middayLine = useMemo(() => t("employee.experience.middayToast"), [t]);
  useEmployeeMiddayToast({
    role: user?.role,
    userId: user?.id,
    showToast,
    middayMessage: middayLine,
  });

  const loadDashboard = useCallback(async () => {
    try {
      const res = await fetch("/api/me/dashboard", {
        credentials: "same-origin",
        cache: "no-store",
      });
      const json = (await res.json().catch(() => null)) as
        | { ok: true; data: DashboardData }
        | { ok: false; error?: string }
        | null;
      if (!json?.ok) return;
      setData(json.data);
      if (roleRef.current === "EMPLOYEE" && json.data.session?.clock_in) {
        try {
          if (!sessionStorage.getItem(EMPLOYEE_WORK_SESSION_STARTED_AT_KEY)) {
            sessionStorage.setItem(EMPLOYEE_WORK_SESSION_STARTED_AT_KEY, json.data.session.clock_in);
          }
        } catch {
          /* */
        }
      }
      if (!json.data.session && roleRef.current === "EMPLOYEE") {
        if (json.data.auto_closed || askedServerToClose.current) {
          showToast({ tone: "success", title: t("employee.dashboard.autoShiftEnded") });
        }
        router.push("/employee/clock");
        router.refresh();
      }
    } finally {
      setLoading(false);
    }
  }, [router, showToast, t]);

  const loadTasks = useCallback(async () => {
    try {
      const res = await fetch("/api/work/my-tasks", {
        credentials: "same-origin",
        cache: "no-store",
      });
      const json = (await res.json().catch(() => null)) as EmployeeTasksCachePayload | null;
      if (!json) return;
      const open =
        json.open?.tasks ?? (json.data ?? []).filter((task) => task.status !== "COMPLETED");
      setWorkTasks(open);
      setTaskStats(json.stats ?? (json.data ? computeEmployeeTaskDayStats(json.data) : null));
      const uid = userIdRef.current;
      if (uid) writeEmployeeTasksCache(uid, json);
    } catch {
      /* secondary widget — the home screen stays up */
    } finally {
      setTasksLoading(false);
    }
  }, []);

  const load = useCallback(async () => {
    await Promise.all([loadDashboard(), loadTasks()]);
  }, [loadDashboard, loadTasks]);

  useEffect(() => {
    freshUntil.current = Date.now() + 2000;
    void loadDashboard();
    void loadTasks();
  }, [loadDashboard, loadTasks]);

  useEffect(() => {
    const onFocus = () => {
      if (Date.now() < freshUntil.current) return;
      void load();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === "hidden") return;
      void load();
    }, 30_000);
    return () => window.clearInterval(id);
  }, [load]);

  const session = data?.session ?? null;
  const sessionStartMs = session ? new Date(session.clock_in).getTime() : null;
  const completedMinutes = data?.today.completed_minutes ?? 0;

  useEffect(() => {
    if (!sessionStartMs || askedServerToClose.current) return;
    const remain = sessionStartMs + MAX_SHIFT_MS - Date.now();
    if (remain <= 0) {
      askedServerToClose.current = true;
      void load();
      return;
    }
    const id = window.setTimeout(() => {
      askedServerToClose.current = true;
      void load();
    }, Math.min(remain, 2_147_483_647));
    return () => window.clearTimeout(id);
  }, [load, sessionStartMs]);

  const activeWorkTask = useMemo(
    () => workTasks.find((x) => x.status === "IN_PROGRESS") ?? null,
    [workTasks],
  );
  const workTaskStats = taskStats;

  const clockInTime = session
    ? new Date(session.clock_in).toLocaleTimeString(bcp47, {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

  async function clockOut() {
    if (clockingOut) return;
    const confirmed = window.confirm(t("employee.dashboard.clockOutConfirm"));
    if (!confirmed) return;
    setClockingOut(true);
    try {
      const res = await fetch("/api/me/work-session/clock-out", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
        credentials: "same-origin",
      });
      const json = (await res.json().catch(() => null)) as
        | { ok: true; data: WorkSessionDto }
        | { ok: false; error?: string }
        | null;
      if (!json || !json.ok) {
        showToast({
          tone: "error",
          title: t("employee.dashboard.clockOutErr"),
          description: (json && !json.ok ? json.error : undefined) ?? "",
        });
        return;
      }
      const storedMinutes = Math.min(json.data.total_minutes ?? 0, MAX_SHIFT_MINUTES);
      showToast({
        tone: "success",
        title:
          json.data.checkout_type === "AUTO_12_HOURS"
            ? t("employee.dashboard.autoShiftEnded")
            : t("employee.dashboard.clockOutOk", { minutes: fmtHMM(storedMinutes) }),
      });
      try {
        sessionStorage.removeItem(EMPLOYEE_WORK_SESSION_STARTED_AT_KEY);
      } catch {
        /* */
      }
      setData((current) => (current ? { ...current, session: null } : current));
      router.push("/employee/clock");
      router.refresh();
    } finally {
      setClockingOut(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-slate-400" aria-hidden />
      </div>
    );
  }

  return (
    <div dir={dir} className="mx-auto max-w-5xl space-y-5 p-3 md:p-6">
      <EmployeeGreetingHeader
        className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 md:p-5"
        name={user?.fullName ?? ""}
        subtitle={t("employee.dashboard.startedAt", { time: clockInTime })}
        action={
          <button
            type="button"
            onClick={() => void clockOut()}
            disabled={clockingOut}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            {clockingOut ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <LogOut className="h-4 w-4" aria-hidden />
            )}
            {clockingOut ? t("common.completing") : t("employee.dashboard.clockOutBtn")}
          </button>
        }
      />

      <MyNotesWidget />

      <div className="space-y-3">
        <EmployeeLiveStatus activeTask={activeWorkTask} />
        {tasksLoading && !workTaskStats ? (
          <div className="h-24 animate-pulse rounded-2xl bg-slate-100" aria-hidden />
        ) : workTaskStats && (workTasks.length > 0 || workTaskStats.total > 0) ? (
          <>
            <EmployeeDailyProgress stats={workTaskStats} />
            <EmployeeMotivationCard stats={workTaskStats} />
          </>
        ) : null}
      </div>

      <TodayMinutesLive
        completedMinutes={completedMinutes}
        clockIn={session?.clock_in ?? null}
        render={(todayMinutes) => {
          const liveMinutes = session ? Math.max(0, todayMinutes - completedMinutes) : 0;
          return (
            <>
              {workTaskStats && (workTasks.length > 0 || workTaskStats.total > 0) ? (
                <EmployeeProfileStrip todayMinutes={todayMinutes} stats={workTaskStats} />
              ) : null}
              <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <KpiCard
                  label={t("employee.dashboard.kpiToday")}
                  value={fmtHMM(todayMinutes)}
                  accent="blue"
                  icon={<Clock3 className="h-5 w-5" aria-hidden />}
                />
                <KpiCard
                  label={t("employee.dashboard.kpiLive")}
                  value={fmtHMM(liveMinutes)}
                  accent="indigo"
                  pulse
                  icon={<Sparkles className="h-5 w-5" aria-hidden />}
                />
                <KpiCard
                  label={t("employee.dashboard.kpiOpenTasks")}
                  value={String(data?.counts.open_tasks ?? 0)}
                  accent="emerald"
                  icon={<ClipboardList className="h-5 w-5" aria-hidden />}
                />
                <KpiCard
                  label={t("employee.dashboard.kpiLateTasks")}
                  value={String(data?.counts.late_tasks ?? 0)}
                  accent={data && data.counts.late_tasks > 0 ? "indigo" : "slate"}
                  icon={
                    data && data.counts.late_tasks > 0 ? (
                      <AlertTriangle className="h-5 w-5" aria-hidden />
                    ) : (
                      <CheckCircle2 className="h-5 w-5" aria-hidden />
                    )
                  }
                />
              </section>
            </>
          );
        }}
      />

      {/* Active task hero */}
      <section>
        <h2 className="mb-2 px-1 text-sm font-black text-slate-700">
          {t("employee.dashboard.activeTitle")}
        </h2>
        {data?.active_run ? (
          <WorkflowRunCard
            run={data.active_run}
            canControl
            employeeView
            onChanged={() => void load()}
          />
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm">
            <Workflow className="mx-auto h-8 w-8 text-slate-300" aria-hidden />
            <p className="mt-2 text-base font-black text-slate-700">
              {t("employee.dashboard.noActive")}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {t("employee.dashboard.noActiveHint")}
            </p>
            <Link
              href="/employee/work-status"
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-black text-white shadow-sm hover:bg-blue-700"
            >
              <Sparkles className="h-4 w-4" aria-hidden />
              {t("employee.dashboard.openMyTasks")}
            </Link>
          </div>
        )}
      </section>

      {data && data.other_active_run_count > 0 ? (
        <p className="px-1 text-xs font-semibold text-slate-500">
          {t("employee.dashboard.otherRuns", { n: data.other_active_run_count })}
        </p>
      ) : null}
    </div>
  );
}

function KpiCard({
  label,
  value,
  accent,
  icon,
  pulse,
}: {
  label: string;
  value: string;
  accent: "blue" | "emerald" | "rose" | "slate" | "indigo";
  icon: React.ReactNode;
  pulse?: boolean;
}) {
  const tone =
    accent === "blue"
      ? "from-blue-50 to-blue-100 text-blue-800 ring-blue-200"
      : accent === "emerald"
        ? "from-emerald-50 to-emerald-100 text-emerald-800 ring-emerald-200"
        : accent === "rose"
          ? "from-rose-50 to-rose-100 text-rose-800 ring-rose-200"
          : accent === "indigo"
            ? "from-indigo-50 to-indigo-100 text-indigo-800 ring-indigo-200"
            : "from-slate-50 to-slate-100 text-slate-700 ring-slate-200";
  return (
    <div
      className={`rounded-2xl bg-gradient-to-br ${tone} px-4 py-3 shadow-sm ring-1 ${
        pulse ? "wf-pulse" : ""
      }`}
    >
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-extrabold uppercase tracking-wider opacity-75">
          {label}
        </p>
        <span className="opacity-80">{icon}</span>
      </div>
      <p className="mt-1 font-mono text-2xl font-black tabular-nums md:text-3xl">{value}</p>
    </div>
  );
}
