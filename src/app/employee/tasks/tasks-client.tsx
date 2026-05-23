"use client";

import { KeyRound, Loader2, Timer } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { SerializedWorkEmployeeTask } from "@/lib/work-tasks/serialize-work-task";
import { computeCountdownTimer } from "@/lib/tasks/countdown-timer";
import { playEmployeeSound } from "@/lib/employee-experience/sounds";
import { computeEmployeeTaskDayStats } from "@/lib/employee-experience/task-stats";
import { EmployeeTaskCard } from "@/components/tasks/employee-task-card";
import { EmployeeTasksSession } from "@/components/tasks/employee-tasks-session";
import { EmployeeDailyProgress } from "@/components/employee/employee-daily-progress";
import { EmployeeEmptyTasks } from "@/components/employee/employee-empty-tasks";
import { EmployeeGreetingHeader } from "@/components/employee/employee-greeting-header";
import { EmployeeLateReasonModal } from "@/components/employee/employee-late-reason-modal";
import { EmployeeLiveStatus } from "@/components/employee/employee-live-status";
import { EmployeeMotivationCard } from "@/components/employee/employee-motivation-card";
import { EmployeeProfileStrip } from "@/components/employee/employee-profile-strip";
import { ChangePasswordDialog } from "@/components/auth/change-password-dialog";
import { useAuth } from "@/components/auth-provider";
import { useI18n } from "@/components/i18n-provider";
import { useToast } from "@/components/toast-provider";
import { dispatchNotificationsRefresh } from "@/lib/notifications/refresh-event";
import { TaskCelebrationOverlay } from "@/components/employee/task-celebration-overlay";
import { useEmployeeMiddayToast } from "@/hooks/use-employee-midday-toast";
import { useEmployeeTodayMinutes } from "@/hooks/use-employee-today-minutes";

type LateModalState = {
  taskId: string;
  taskTitle: string;
  estimated: number | null;
  reason: string;
  submitting: boolean;
  error: string | null;
};

const QUICK_DELAY_REASON_KEYS = [
  "customerLoad",
  "outOfStock",
  "cashRegisterIssue",
  "technicalIssue",
  "waitingExtra",
] as const;

function sortTasksForFocus(tasks: SerializedWorkEmployeeTask[]): SerializedWorkEmployeeTask[] {
  const rank = (s: string) => {
    if (s === "IN_PROGRESS") return 0;
    if (s === "PENDING") return 1;
    if (s === "COMPLETED") return 2;
    return 3;
  };
  return [...tasks].sort((a, b) => {
    const dr = rank(a.status) - rank(b.status);
    if (dr !== 0) return dr;
    return a.order_index - b.order_index;
  });
}

export function EmployeeTasksClient() {
  const { t, dir } = useI18n();
  const { showToast } = useToast();
  const { user, refresh: refreshAuth } = useAuth();
  const [tasks, setTasks] = useState<SerializedWorkEmployeeTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needAuth, setNeedAuth] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [lateModal, setLateModal] = useState<LateModalState | null>(null);
  const [pwOpen, setPwOpen] = useState(false);
  const [celebration, setCelebration] = useState(false);
  const [completedEarly, setCompletedEarly] = useState(false);
  const forcedPw = user?.mustChangePassword === true;
  const { todayMinutes } = useEmployeeTodayMinutes(!needAuth && !loading);

  const middayLine = useMemo(() => t("employee.experience.middayToast"), [t]);
  useEmployeeMiddayToast({
    role: user?.role,
    userId: user?.id,
    showToast,
    middayMessage: middayLine,
  });

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/work/my-tasks?_=${Date.now()}`, {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (res.status === 401) {
        setNeedAuth(true);
        setError(t("employee.tasks.loginRequiredView"));
        return;
      }
      if (res.status === 403) {
        setError(t("employee.tasks.noPermission"));
        return;
      }
      const j = (await res.json()) as { data?: SerializedWorkEmployeeTask[] };
      setNeedAuth(false);
      setTasks(j.data ?? []);
    } catch {
      setError(t("employee.tasks.loadError"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, [load]);

  useEffect(() => {
    const h = window.setInterval(() => {
      void load();
    }, 30_000);
    return () => window.clearInterval(h);
  }, [load]);

  const startWork = async (id: string) => {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/work/tasks/${encodeURIComponent(id)}/start`, {
        method: "POST",
        credentials: "same-origin",
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        code?: string;
      };
      if (res.ok && j.ok !== false) {
        playEmployeeSound("start");
        showToast({ tone: "success", title: t("employee.experience.taskStartedToast") });
        await load();
        return;
      }
      let msg = j.error?.trim() || t("employee.tasks.errors.startFailed");
      if (j.code === "NOT_YOUR_TASK" || j.code === "NO_EMPLOYEE_CARD") {
        msg = t("employee.tasks.errors.ownershipMismatch");
      }
      setError(msg);
    } catch {
      setError(t("employee.tasks.errors.startFailed"));
    } finally {
      setBusyId(null);
    }
  };

  const completeWork = async (task: SerializedWorkEmployeeTask, providedReason?: string) => {
    const snapBefore =
      task.started_at && task.estimated_minutes
        ? computeCountdownTimer({
            estimatedMinutes: task.estimated_minutes,
            startedAt: task.started_at,
            taskStatus: "IN_PROGRESS",
            nowMs: Date.now(),
          })
        : null;
    const wasOnTime = snapBefore
      ? !snapBefore.isOverdue && snapBefore.statusKey !== "LATE" && snapBefore.statusKey !== "OVERDUE"
      : true;

    setBusyId(task.id);
    try {
      const res = await fetch(`/api/work/tasks/${encodeURIComponent(task.id)}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(providedReason ? { delay_reason: providedReason } : {}),
      });
      const raw = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        code?: string;
        notificationSent?: boolean;
      };

      if (res.ok && raw.ok !== false) {
        setLateModal(null);
        playEmployeeSound("complete");
        setCompletedEarly(wasOnTime && !providedReason);
        setCelebration(true);
        if (providedReason) {
          showToast({
            tone: "success",
            title: t("employee.experience.lateCompleteToast"),
          });
        } else if (wasOnTime) {
          showToast({
            tone: "success",
            title: t("employee.experience.onTimeToast"),
          });
        } else {
          showToast({
            tone: "success",
            title: t("employee.experience.completeToast"),
          });
        }
        dispatchNotificationsRefresh();
        await load();
        return;
      }

      if (raw.code === "NEED_DELAY_REASON") {
        setLateModal({
          taskId: task.id,
          taskTitle: task.title,
          estimated: task.estimated_minutes,
          reason: providedReason ?? "",
          submitting: false,
          error: raw.error ?? t("employee.tasks.requiresDelayReason"),
        });
        return;
      }
      let msg = raw.error?.trim() ?? t("employee.tasks.errors.completeFailed");
      if (raw.code === "NOT_YOUR_TASK" || raw.code === "NO_EMPLOYEE_CARD") {
        msg = t("employee.tasks.errors.ownershipMismatch");
      }
      setError(msg);
    } finally {
      setBusyId(null);
    }
  };

  const submitLateReason = async () => {
    if (!lateModal) return;
    const reason = lateModal.reason.trim();
    if (!reason) {
      setLateModal({ ...lateModal, error: t("employee.tasks.lateReasonRequired") });
      return;
    }
    setLateModal({ ...lateModal, submitting: true, error: null });
    const target = tasks.find((x) => x.id === lateModal.taskId);
    if (!target) {
      setLateModal(null);
      return;
    }
    await completeWork(target, reason);
  };

  const activeTask = useMemo(
    () => tasks.find((x) => x.status === "IN_PROGRESS") ?? null,
    [tasks],
  );

  const sortedTasks = useMemo(() => sortTasksForFocus(tasks), [tasks]);
  const dayStats = useMemo(() => computeEmployeeTaskDayStats(tasks), [tasks]);

  if (needAuth) {
    return (
      <div className="mx-auto max-w-md space-y-6 px-4 py-12" dir={dir}>
        <div className="app-panel p-6 text-center">
          <Timer className="mx-auto h-10 w-10 text-luxury-gold" aria-hidden />
          <h1 className="mt-3 text-2xl font-black text-slate-950">{t("employee.tasks.loginRequired")}</h1>
          <p className="mt-2 text-sm text-slate-600">{t("employee.tasks.loginPrompt")}</p>
          <a
            href="/login"
            className="mt-5 inline-flex items-center justify-center rounded-xl bg-luxury-navy-rich px-5 py-3 text-sm font-black text-white"
          >
            {t("employee.tasks.loginButton")}
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl pb-16" dir={dir}>
      {celebration ? (
        <TaskCelebrationOverlay
          open
          variant="task"
          completedEarly={completedEarly}
          onClose={() => setCelebration(false)}
        />
      ) : null}

      <EmployeeGreetingHeader
        className="px-3 pb-3 pt-2 sm:px-4"
        name={user?.fullName ?? ""}
        subtitle={t("employee.tasks.focusHint")}
        action={
          <button
            type="button"
            onClick={() => setPwOpen(true)}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50"
          >
            <KeyRound className="h-4 w-4" aria-hidden />
            {t("employee.tasks.changePassword")}
          </button>
        }
      />

      {!loading ? (
        <div className="mx-3 space-y-3 sm:mx-4 sm:space-y-4">
          <EmployeeLiveStatus activeTask={activeTask} />
          <EmployeeDailyProgress stats={dayStats} />
          <EmployeeMotivationCard stats={dayStats} />
          <EmployeeProfileStrip todayMinutes={todayMinutes} stats={dayStats} />
        </div>
      ) : null}

      {!loading && tasks.length > 0 ? (
        <EmployeeTasksSession tasks={tasks} activeTask={activeTask} />
      ) : null}

      {error && !needAuth ? (
        <p className="mx-3 mt-3 text-sm font-bold text-rose-700 sm:mx-4" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <div className="flex flex-col items-center justify-center gap-3 py-20 text-slate-600" role="status" aria-busy="true">
          <Loader2 className="h-8 w-8 animate-spin text-[#2563eb]" aria-hidden />
          <p className="text-sm font-semibold">{t("employee.tasks.loadingTasks")}</p>
        </div>
      ) : tasks.length === 0 ? (
        <EmployeeEmptyTasks className="mx-3 sm:mx-4" />
      ) : (
        <ul className="mt-4 space-y-4 px-3 sm:mt-6 sm:space-y-5 sm:px-4">
          {sortedTasks.map((task) => {
            const isActive = activeTask?.id === task.id;
            const hasDifferentActive = Boolean(activeTask && activeTask.id !== task.id);
            const canStart = task.status === "PENDING" && !hasDifferentActive;
            const canComplete = task.status === "IN_PROGRESS";
            const isCollapsed = Boolean(activeTask && !isActive);

            return (
              <li key={task.id} className={isActive ? "motion-safe:animate-[etask-expand_0.35s_ease-out]" : undefined}>
                <EmployeeTaskCard
                  task={task}
                  isActive={isActive}
                  isCollapsed={isCollapsed}
                  busy={busyId === task.id}
                  canStart={canStart}
                  canComplete={canComplete}
                  onStart={() => void startWork(task.id)}
                  onComplete={() => void completeWork(task)}
                />
              </li>
            );
          })}
        </ul>
      )}

      <ChangePasswordDialog
        open={pwOpen}
        forced={forcedPw}
        onClose={() => {
          if (!forcedPw) setPwOpen(false);
        }}
        onSuccess={() => {
          setPwOpen(false);
          void refreshAuth();
        }}
      />
      <EmployeeLateReasonModal
        open={lateModal != null}
        taskTitle={lateModal?.taskTitle ?? ""}
        estimatedMinutes={lateModal?.estimated ?? null}
        reason={lateModal?.reason ?? ""}
        error={lateModal?.error ?? null}
        submitting={lateModal?.submitting ?? false}
        quickReasonKeys={QUICK_DELAY_REASON_KEYS}
        onReasonChange={(reason) => setLateModal((cur) => (cur ? { ...cur, reason } : cur))}
        onCancel={() => setLateModal(null)}
        onSubmit={() => void submitLateReason()}
      />
    </div>
  );
}
