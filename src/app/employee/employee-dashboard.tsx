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
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { useI18n } from "@/components/i18n-provider";
import { useToast } from "@/components/toast-provider";
import { useEmployeeMiddayToast } from "@/hooks/use-employee-midday-toast";
import { useEmployeeTodayMinutes } from "@/hooks/use-employee-today-minutes";
import { computeEmployeeTaskDayStats } from "@/lib/employee-experience/task-stats";
import { EMPLOYEE_WORK_SESSION_STARTED_AT_KEY } from "@/lib/employee-experience/storage-keys";
import { EmployeeDailyProgress } from "@/components/employee/employee-daily-progress";
import { EmployeeGreetingHeader } from "@/components/employee/employee-greeting-header";
import { EmployeeLiveStatus } from "@/components/employee/employee-live-status";
import { EmployeeMotivationCard } from "@/components/employee/employee-motivation-card";
import { EmployeeProfileStrip } from "@/components/employee/employee-profile-strip";
import type { SerializedWorkEmployeeTask } from "@/lib/work-tasks/serialize-work-task";
import { WorkflowRunCard } from "@/components/workflows/workflow-run-card";
import type { WorkflowRunDetailDto } from "@/lib/workflows/serialize";
import type { WorkSessionDto } from "@/lib/work-sessions/serialize";

type DashboardData = {
  session: WorkSessionDto | null;
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
 *  - One `setInterval(setNow, 1000)` for the live timer.
 *  - Re-fetch dashboard every 30s and on focus to stay honest after sleeps.
 */
export function EmployeeDashboard() {
  const { t, dir, locale } = useI18n();
  const { showToast } = useToast();
  const { user } = useAuth();
  const router = useRouter();

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const [clockingOut, setClockingOut] = useState(false);
  const [workTasks, setWorkTasks] = useState<SerializedWorkEmployeeTask[]>([]);
  const { todayMinutes } = useEmployeeTodayMinutes(true);

  const middayLine = useMemo(() => t("employee.experience.middayToast"), [t]);
  useEmployeeMiddayToast({
    role: user?.role,
    userId: user?.id,
    showToast,
    middayMessage: middayLine,
  });

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/me/dashboard?_=${Date.now()}`, {
        credentials: "same-origin",
        cache: "no-store",
      });
      const json = (await res.json().catch(() => null)) as
        | { ok: true; data: DashboardData }
        | { ok: false; error?: string }
        | null;
      if (json?.ok) {
        setData(json.data);
        try {
          const tr = await fetch("/api/work/my-tasks", { credentials: "same-origin", cache: "no-store" });
          const tj = (await tr.json()) as { data?: SerializedWorkEmployeeTask[] };
          setWorkTasks(tj.data ?? []);
        } catch {
          /* */
        }
        if (user?.role === "EMPLOYEE" && json.data.session?.clock_in) {
          try {
            if (!sessionStorage.getItem(EMPLOYEE_WORK_SESSION_STARTED_AT_KEY)) {
              sessionStorage.setItem(EMPLOYEE_WORK_SESSION_STARTED_AT_KEY, json.data.session.clock_in);
            }
          } catch {
            /* */
          }
        }
        // Session gone (clocked out from another tab/device) — bounce to gate.
        if (!json.data.session && user?.role === "EMPLOYEE") {
          router.push("/employee/clock");
          router.refresh();
        }
      }
    } finally {
      setLoading(false);
    }
  }, [router, user?.role]);

  useEffect(() => {
    try {
      sessionStorage.removeItem("wego:employee-tasks-cache");
    } catch {
      /* */
    }
    queueMicrotask(() => {
      void load();
    });
  }, [load]);

  useEffect(() => {
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  useEffect(() => {
    const id = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(id);
  }, [load]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const session = data?.session ?? null;
  const sessionStartMs = session ? new Date(session.clock_in).getTime() : null;

  // Live "time so far in current session" plus already-completed minutes today.
  const liveMinutes = useMemo(() => {
    if (!sessionStartMs) return 0;
    return Math.max(0, Math.floor((now - sessionStartMs) / 60_000));
  }, [now, sessionStartMs]);

  const todayMinutesLive = (data?.today.completed_minutes ?? 0) + liveMinutes;
  const activeWorkTask = useMemo(
    () => workTasks.find((x) => x.status === "IN_PROGRESS") ?? null,
    [workTasks],
  );
  const workTaskStats = useMemo(() => computeEmployeeTaskDayStats(workTasks), [workTasks]);

  const bcp47 = locale === "ar" ? "ar-EG" : locale === "en" ? "en-US" : "he-IL";
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
      showToast({
        tone: "success",
        title: t("employee.dashboard.clockOutOk", {
          minutes: fmtHMM(json.data.total_minutes ?? 0),
        }),
      });
      try {
        sessionStorage.removeItem(EMPLOYEE_WORK_SESSION_STARTED_AT_KEY);
      } catch {
        /* */
      }
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
            {t("employee.dashboard.clockOutBtn")}
          </button>
        }
      />

      <div className="space-y-3">
        <EmployeeLiveStatus activeTask={activeWorkTask} />
        {workTasks.length > 0 ? (
          <>
            <EmployeeDailyProgress stats={workTaskStats} />
            <EmployeeMotivationCard stats={workTaskStats} />
            <EmployeeProfileStrip todayMinutes={todayMinutes} stats={workTaskStats} />
          </>
        ) : null}
      </div>

      {/* KPI cards */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label={t("employee.dashboard.kpiToday")}
          value={fmtHMM(todayMinutesLive)}
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
