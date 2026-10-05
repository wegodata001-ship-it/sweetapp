"use client";

import { KeyRound, Timer } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SerializedWorkEmployeeTask } from "@/lib/work-tasks/serialize-work-task";
import { myTasksFingerprint } from "@/lib/work-tasks/my-tasks-snapshot";
import { computeCountdownTimer } from "@/lib/tasks/countdown-timer";
import { TASK_BLOCK_REASONS } from "@/lib/work-tasks/task-timing";
import { playEmployeeSound } from "@/lib/employee-experience/sounds";
import { computeEmployeeTaskDayStats } from "@/lib/employee-experience/task-stats";
import { EMPLOYEE_WORK_SESSION_STARTED_AT_KEY } from "@/lib/employee-experience/storage-keys";
import { EmployeeTaskCard } from "@/components/tasks/employee-task-card";
import { EmployeeTasksSession } from "@/components/tasks/employee-tasks-session";
import { EmployeeDailyProgress } from "@/components/employee/employee-daily-progress";
import { EmployeeEmptyTasks } from "@/components/employee/employee-empty-tasks";
import { EmployeeGreetingHeader } from "@/components/employee/employee-greeting-header";
import { CompleteTaskModal, type CompleteTaskModalModel } from "@/components/tasks/complete-task-modal";
import {
  describeLateness,
  formatTaskDateTime,
  isEmployeeWorkTaskLate,
  taskDeadlineAt,
} from "@/lib/tasks/completion";
import { EmployeeLiveStatus } from "@/components/employee/employee-live-status";
import { EmployeeMotivationCard } from "@/components/employee/employee-motivation-card";
import { EmployeeProfileStrip } from "@/components/employee/employee-profile-strip";
import { TodayMinutesLive } from "@/components/employee/today-minutes-live";
import { ChangePasswordDialog } from "@/components/auth/change-password-dialog";
import { useAuth } from "@/components/auth-provider";
import { useI18n } from "@/components/i18n-provider";
import { useToast } from "@/components/toast-provider";
import { TaskCelebrationOverlay } from "@/components/employee/task-celebration-overlay";
import { useEmployeeMiddayToast } from "@/hooks/use-employee-midday-toast";

type CompleteModalState = {
  task: SerializedWorkEmployeeTask;
  lateReason: string;
  completionNote: string;
  submitting: boolean;
  error: string | null;
};

type SnapshotPayload = {
  ok?: boolean;
  data?: SerializedWorkEmployeeTask[];
  shift?: { clock_in: string } | null;
  today?: { completed_minutes: number };
  auto_closed?: boolean;
  shift_open?: boolean;
};

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
  const { t, dir, bcp47 } = useI18n();
  const router = useRouter();
  const { showToast } = useToast();
  const { user, refresh: refreshAuth } = useAuth();
  const [tasks, setTasks] = useState<SerializedWorkEmployeeTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needAuth, setNeedAuth] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [completeModal, setCompleteModal] = useState<CompleteModalState | null>(null);
  const [pwOpen, setPwOpen] = useState(false);
  const [celebration, setCelebration] = useState(false);
  const [completedEarly, setCompletedEarly] = useState(false);
  const [clockIn, setClockIn] = useState<string | null>(null);
  const [completedMinutes, setCompletedMinutes] = useState(0);
  const actionLock = useRef(false);
  const tasksRef = useRef(tasks);
  const printRef = useRef("");
  const tRef = useRef(t);
  const redirectedRef = useRef(false);
  tasksRef.current = tasks;
  tRef.current = t;
  const forcedPw = user?.mustChangePassword === true;

  const middayLine = useMemo(() => t("employee.experience.middayToast"), [t]);
  useEmployeeMiddayToast({
    role: user?.role,
    userId: user?.id,
    showToast,
    middayMessage: middayLine,
  });

  const applySnapshot = useCallback((j: SnapshotPayload) => {
    const next = j.data ?? [];
    const print = myTasksFingerprint(next);
    if (print !== printRef.current) {
      printRef.current = print;
      setTasks(next);
    }
    if (j.today?.completed_minutes != null) {
      setCompletedMinutes(j.today.completed_minutes);
    }
    if (j.shift?.clock_in) {
      setClockIn(j.shift.clock_in);
      try {
        if (!sessionStorage.getItem(EMPLOYEE_WORK_SESSION_STARTED_AT_KEY)) {
          sessionStorage.setItem(EMPLOYEE_WORK_SESSION_STARTED_AT_KEY, j.shift.clock_in);
        }
      } catch {
        /* */
      }
    } else {
      setClockIn(null);
    }
    return j;
  }, []);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setError(null);
    try {
      const res = await fetch("/api/work/my-tasks", {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (res.status === 401) {
        setNeedAuth(true);
        setError(tRef.current("employee.tasks.loginRequiredView"));
        return;
      }
      if (res.status === 403) {
        setError(tRef.current("employee.tasks.noPermission"));
        return;
      }
      const j = (await res.json()) as SnapshotPayload;
      setNeedAuth(false);
      applySnapshot(j);
      if (j.shift_open === false && !redirectedRef.current) {
        redirectedRef.current = true;
        router.push(j.auto_closed ? "/employee/clock?ended=auto" : "/employee/clock");
      }
    } catch {
      setError(tRef.current("employee.tasks.loadError"));
    } finally {
      setLoading(false);
    }
  }, [applySnapshot, router]);

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, [load]);

  useEffect(() => {
    const h = window.setInterval(() => {
      if (document.visibilityState === "hidden") return;
      void load({ silent: true });
    }, 45_000);
    return () => window.clearInterval(h);
  }, [load]);

  const startWork = useCallback(async (id: string) => {
    if (actionLock.current) return;
    actionLock.current = true;
    setBusyId(id);
    setError(null);
    const snapshot = tasksRef.current;
    const optimisticAt = new Date().toISOString();
    setTasks((current) =>
      current.map((task) =>
        task.id === id
          ? {
              ...task,
              status: "IN_PROGRESS",
              started_at: task.started_at ?? optimisticAt,
              segment_started_at: optimisticAt,
            }
          : task,
      ),
    );
    try {
      const res = await fetch(`/api/work/tasks/${encodeURIComponent(id)}/start`, {
        method: "POST",
        credentials: "same-origin",
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        code?: string;
        data?: SerializedWorkEmployeeTask;
      };
      if (res.ok && j.ok !== false && j.data) {
        const confirmed = j.data;
        setTasks((current) => {
          const next = current.map((task) => (task.id === id ? { ...task, ...confirmed } : task));
          printRef.current = myTasksFingerprint(next);
          return next;
        });
        playEmployeeSound("start");
        showToast({ tone: "success", title: tRef.current("employee.experience.taskStartedToast") });
        return;
      }
      setTasks(snapshot);
      if (j.code === "SHIFT_ENDED") {
        showToast({ tone: "success", title: tRef.current("employee.dashboard.autoShiftEnded") });
        router.push("/employee/clock");
        return;
      }
      let msg = j.error?.trim() || tRef.current("employee.tasks.errors.startFailed");
      if (j.code === "NOT_YOUR_TASK" || j.code === "NO_EMPLOYEE_CARD") {
        msg = tRef.current("employee.tasks.errors.ownershipMismatch");
      }
      setError(msg);
    } catch {
      setTasks(snapshot);
      setError(tRef.current("employee.tasks.errors.startFailed"));
    } finally {
      actionLock.current = false;
      setBusyId(null);
    }
  }, [router, showToast]);

  const openCompleteModal = useCallback((task: SerializedWorkEmployeeTask) => {
    setCompleteModal({
      task,
      lateReason: "",
      completionNote: "",
      submitting: false,
      error: null,
    });
  }, []);

  const completeWork = async (task: SerializedWorkEmployeeTask, delayReason: string) => {
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
      : !isEmployeeWorkTaskLate({
          status: task.status,
          startedAt: task.started_at,
          estimatedMinutes: task.estimated_minutes,
          targetDueAt: task.target_due_at,
        });

    if (actionLock.current) return false;
    actionLock.current = true;
    setBusyId(task.id);
    try {
      const res = await fetch(`/api/work/tasks/${encodeURIComponent(task.id)}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(delayReason ? { late_reason: delayReason } : {}),
      });
      const raw = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        code?: string;
        completedTask?: SerializedWorkEmployeeTask;
        data?: SerializedWorkEmployeeTask;
        nextTask?: SerializedWorkEmployeeTask | null;
      };

      if (res.ok && raw.ok !== false) {
        const completed = raw.completedTask ?? raw.data;
        setTasks((current) => {
          const next = current.map((row) =>
            row.id === task.id && completed
              ? { ...row, ...completed }
              : row.id === task.id
                ? { ...row, status: "COMPLETED", completed_at: new Date().toISOString() }
                : row,
          );
          if (raw.nextTask && !next.some((row) => row.id === raw.nextTask!.id)) {
            next.push(raw.nextTask);
          }
          printRef.current = myTasksFingerprint(next);
          return next;
        });
        setCompleteModal(null);
        playEmployeeSound("complete");
        setCompletedEarly(wasOnTime && !delayReason);
        setCelebration(true);
        showToast({ tone: "success", title: t("completeTask.success") });
        return true;
      }

      if (raw.code === "SHIFT_ENDED") {
        setCompleteModal(null);
        showToast({ tone: "success", title: t("employee.dashboard.autoShiftEnded") });
        router.push("/employee/clock");
        return false;
      }
      const msg =
        raw.code === "NOT_YOUR_TASK" || raw.code === "NO_EMPLOYEE_CARD"
          ? t("employee.tasks.errors.ownershipMismatch")
          : raw.error?.trim() || t("completeTask.failed");
      setCompleteModal((cur) => (cur ? { ...cur, submitting: false, error: msg } : cur));
      return false;
    } catch {
      setCompleteModal((cur) =>
        cur ? { ...cur, submitting: false, error: t("completeTask.failed") } : cur,
      );
      return false;
    } finally {
      actionLock.current = false;
      setBusyId(null);
    }
  };

  const submitCompleteModal = async () => {
    if (!completeModal || completeModal.submitting) return;
    const late = isEmployeeWorkTaskLate({
      status: completeModal.task.status,
      startedAt: completeModal.task.started_at,
      estimatedMinutes: completeModal.task.estimated_minutes,
      targetDueAt: completeModal.task.target_due_at,
    });
    const lateReason = completeModal.lateReason.trim();
    const note = completeModal.completionNote.trim();
    if (late && !lateReason) {
      setCompleteModal({ ...completeModal, error: t("completeTask.lateReasonRequiredHint") });
      return;
    }
    setCompleteModal({ ...completeModal, submitting: true, error: null });
    await completeWork(completeModal.task, late ? lateReason : note);
  };

  const completeModalModel = useMemo((): CompleteTaskModalModel | null => {
    if (!completeModal) return null;
    const task = completeModal.task;
    const deadline = taskDeadlineAt({
      startedAt: task.started_at,
      estimatedMinutes: task.estimated_minutes,
      targetDueAt: task.target_due_at,
    });
    const late = isEmployeeWorkTaskLate({
      status: task.status,
      startedAt: task.started_at,
      estimatedMinutes: task.estimated_minutes,
      targetDueAt: task.target_due_at,
    });
    return {
      title: task.title,
      dueLabel: formatTaskDateTime(deadline, bcp47),
      statusLabel: t("completeTask.statusInProgress"),
      isLate: late,
      lateParts: describeLateness({
        startedAt: task.started_at,
        estimatedMinutes: task.estimated_minutes,
        targetDueAt: task.target_due_at,
      }),
      completeAtLabel: formatTaskDateTime(new Date(), bcp47),
    };
  }, [completeModal, bcp47, t]);

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

      <div className="mx-3 space-y-3 sm:mx-4 sm:space-y-4">
        <EmployeeLiveStatus activeTask={activeTask} />
        <EmployeeDailyProgress stats={dayStats} />
        <EmployeeMotivationCard stats={dayStats} />
        <TodayMinutesLive
          completedMinutes={completedMinutes}
          clockIn={clockIn}
          render={(minutes) => <EmployeeProfileStrip todayMinutes={minutes} stats={dayStats} />}
        />
      </div>

      {!loading && tasks.length > 0 ? (
        <EmployeeTasksSession tasks={tasks} activeTask={activeTask} />
      ) : null}

      {error && !needAuth ? (
        <p className="mx-3 mt-3 text-sm font-bold text-rose-700 sm:mx-4" role="alert">
          {error}
        </p>
      ) : null}

      {loading && tasks.length === 0 ? (
        <ul className="mt-4 space-y-4 px-3 sm:mt-6 sm:px-4" aria-busy="true" aria-label={t("employee.tasks.loadingTasks")}>
          {[0, 1, 2].map((i) => (
            <li key={i} className="h-28 animate-pulse rounded-3xl bg-slate-100" />
          ))}
        </ul>
      ) : tasks.length === 0 ? (
        <EmployeeEmptyTasks className="mx-3 sm:mx-4" />
      ) : (
        <ul className="mt-4 space-y-4 px-3 sm:mt-6 sm:space-y-5 sm:px-4">
          {sortedTasks.map((task) => {
            const isActive = activeTask?.id === task.id;
            const hasDifferentActive = Boolean(activeTask && activeTask.id !== task.id);
            const canStart = (task.status === "PENDING" || task.status === "DELAYED") && !hasDifferentActive;
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
                  onStart={startWork}
                  onComplete={openCompleteModal}
                  completedByName={user?.fullName ?? null}
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
      {completeModal && completeModalModel ? (
        <CompleteTaskModal
          open
          task={completeModalModel}
          lateReason={completeModal.lateReason}
          completionNote={completeModal.completionNote}
          submitting={completeModal.submitting}
          error={completeModal.error}
          requireLateReason={completeModalModel.isLate}
          reasonChoices={TASK_BLOCK_REASONS.map((value) => ({
            value,
            label: t(`taskTiming.reason.${value}`),
          }))}
          onLateReasonChange={(lateReason) =>
            setCompleteModal((cur) => (cur ? { ...cur, lateReason, error: null } : cur))
          }
          onCompletionNoteChange={(completionNote) =>
            setCompleteModal((cur) => (cur ? { ...cur, completionNote, error: null } : cur))
          }
          onCancel={() => {
            if (!completeModal.submitting) setCompleteModal(null);
          }}
          onSubmit={() => void submitCompleteModal()}
        />
      ) : null}
    </div>
  );
}
