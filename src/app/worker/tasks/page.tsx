"use client";

import {
  AlertTriangle,
  Check,
  ClipboardList,
  Clock3,
  Flame,
  Loader2,
  Play,
  Square,
  UserRound,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PRIORITY_LABELS, STATUS_LABELS, type TaskEffectiveStatus } from "@/lib/tasks/helpers";
import type { SerializedEmployeeTask } from "@/lib/tasks/serialize-task";

type MeUser = {
  fullName: string;
  employeeId: string | null;
};

function formatDueShort(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleString("he-IL", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function formatTime(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "—";
  }
}

function formatRemain(ms: number) {
  if (ms <= 0) return "—";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h >= 48) return `${Math.floor(h / 24)} ימים`;
  if (h > 0) return `${h}ש ${m}דק`;
  return `${m} דק׳`;
}

function cardClass(eff: TaskEffectiveStatus, urgentOpen: boolean) {
  const base =
    "relative flex min-h-[280px] flex-col rounded-2xl border bg-white p-5 shadow-sm transition";
  if (urgentOpen && eff !== "completed") {
    return `${base} border-orange-400 ring-2 ring-orange-300/60 shadow-[0_0_22px_rgba(251,146,60,0.28)]`;
  }
  if (eff === "overdue") return `${base} border-rose-400 ring-2 ring-rose-200/70`;
  if (eff === "completed") return `${base} border-emerald-300 bg-emerald-50/25`;
  if (eff === "in_progress") return `${base} border-blue-400 bg-blue-50/30`;
  return `${base} border-slate-200 bg-slate-50/30`;
}

export default function WorkerTasksPage() {
  const [user, setUser] = useState<MeUser | null>(null);
  const [tasks, setTasks] = useState<SerializedEmployeeTask[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);

  const loadMe = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me", { credentials: "same-origin" });
      const j = (await res.json()) as { user?: MeUser | null };
      setUser(j.user ?? null);
    } catch {
      setUser(null);
    }
  }, []);

  const loadTasks = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch("/api/tasks?scope=worker", { credentials: "same-origin" });
      if (res.status === 503) {
        setLoadError("אין חיבור למסד");
        return;
      }
      const j = (await res.json()) as { data?: SerializedEmployeeTask[] };
      setTasks(j.data ?? []);
    } catch {
      setLoadError("טעינה נכשלה");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMe();
  }, [loadMe]);

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  useEffect(() => {
    const id = window.setInterval(() => void loadTasks(), 45000);
    return () => window.clearInterval(id);
  }, [loadTasks]);

  const displayName = useMemo(() => {
    const fromTask = tasks[0]?.employee?.name;
    if (fromTask) return fromTask;
    return user?.fullName ?? "עובד";
  }, [tasks, user]);

  const startTask = async (id: string) => {
    setActionId(id);
    try {
      const res = await fetch(`/api/tasks/${encodeURIComponent(id)}/start`, {
        method: "POST",
        credentials: "same-origin",
      });
      if (res.ok) await loadTasks();
    } finally {
      setActionId(null);
    }
  };

  const completeTask = async (id: string) => {
    setActionId(id);
    try {
      const res = await fetch(`/api/tasks/${encodeURIComponent(id)}/complete`, {
        method: "POST",
        credentials: "same-origin",
      });
      if (res.ok) await loadTasks();
    } finally {
      setActionId(null);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6" dir="rtl">
      <section className="app-panel p-6 md:p-8">
        <p className="flex items-center gap-2 text-sm font-bold tracking-[0.12em] text-emerald-700">
          <ClipboardList className="h-4 w-4 shrink-0" aria-hidden />
          פורטל עובד — המשימות שלי
        </p>
        <h1 className="mt-3 text-2xl font-black text-slate-950 md:text-3xl">המשימות שלי</h1>
        <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-600">
          <UserRound className="h-4 w-4 shrink-0 text-luxury-navy-rich" aria-hidden />
          <span className="font-bold text-slate-900">{displayName}</span>
          {tasks[0]?.employee?.department ? (
            <span className="rounded-full bg-luxury-navy-rich/10 px-2 py-0.5 text-xs font-black text-luxury-navy-rich">
              {tasks[0].employee.department}
            </span>
          ) : null}
        </p>
        {!user?.employeeId && !loading ? (
          <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">
            לא שויך עובד לחשבון — פנה למנהל לשיוך במסך משתמשים.
          </p>
        ) : null}
        {loadError ? (
          <p className="mt-3 text-sm font-bold text-rose-700" role="alert">
            {loadError}
          </p>
        ) : null}
      </section>

      <section className="app-panel p-5 md:p-6">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-slate-600">
            <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
            טוען משימות…
          </div>
        ) : tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
            <div className="rounded-full border border-slate-200 bg-slate-50 p-6 shadow-inner">
              <ClipboardList className="h-14 w-14 text-luxury-navy-rich/40" aria-hidden />
            </div>
            <div>
              <p className="text-lg font-black text-slate-900">אין משימות פעילות כרגע</p>
              <p className="mt-1 text-sm text-slate-600">כשהמנהל יקצה משימה — היא תופיע כאן.</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {tasks.map((task) => {
              const eff = task.effective_status as TaskEffectiveStatus;
              const urgentOpen = task.priority === "urgent" && task.status !== "completed";
              const prLabel = PRIORITY_LABELS[task.priority] ?? task.priority;

              return (
                <article key={task.id} className={cardClass(eff, urgentOpen)}>
                  {urgentOpen ? (
                    <div className="absolute start-4 top-4 flex items-center gap-1 rounded-full bg-orange-500 px-2.5 py-0.5 text-[11px] font-black text-white shadow-md">
                      <Flame className="h-3.5 w-3.5" aria-hidden />
                      משימה דחופה
                    </div>
                  ) : null}
                  {eff === "overdue" && task.status !== "completed" ? (
                    <div
                      className={`absolute ${urgentOpen ? "start-4 top-12" : "start-4 top-4"} flex items-center gap-1 rounded-full bg-rose-600 px-2.5 py-0.5 text-[11px] font-black text-white shadow-md`}
                    >
                      <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                      באיחור
                    </div>
                  ) : null}

                  <div className={`flex flex-col gap-1 ${urgentOpen || (eff === "overdue" && task.status !== "completed") ? "pt-10" : ""}`}>
                    <p className="text-sm font-black text-slate-950">
                      👤 {task.employee.name}
                      {task.employee.role ? ` — ${task.employee.role}` : ""}
                    </p>
                    {task.title ? (
                      <p className="text-xs font-bold text-slate-500">{task.title}</p>
                    ) : null}
                  </div>

                  <p className="mt-4 line-clamp-5 text-sm leading-relaxed text-slate-800">
                    📌 {task.description}
                  </p>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-black ${
                        task.priority === "urgent"
                          ? "border-orange-400 bg-orange-50 text-orange-950"
                          : "border-slate-200 bg-white text-slate-800"
                      }`}
                    >
                      {task.priority === "urgent" ? "🔥 " : ""}
                      {prLabel}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-black text-slate-800">
                      📍 {STATUS_LABELS[eff]}
                    </span>
                  </div>

                  <div className="mt-4 space-y-1.5 border-t border-slate-100 pt-4 text-xs font-semibold text-slate-600">
                    <p className="flex items-center gap-2">
                      <Clock3 className="h-3.5 w-3.5 shrink-0 text-luxury-navy-rich" aria-hidden />
                      🕒 התחלה: {formatTime(task.started_at)}
                    </p>
                    <p className="flex items-center gap-2">
                      <Clock3 className="h-3.5 w-3.5 shrink-0 text-luxury-navy-rich" aria-hidden />
                      ⏰ יעד: {formatDueShort(task.due_at)}
                    </p>
                    {task.status !== "completed" ? (
                      <p>
                        זמן שנותר:{" "}
                        <span className="font-black text-slate-900">{formatRemain(task.remaining_ms)}</span>
                      </p>
                    ) : null}
                  </div>

                  <div className="mt-auto flex flex-wrap gap-2 pt-5">
                    {task.status === "pending" ? (
                      <button
                        type="button"
                        disabled={actionId === task.id}
                        onClick={() => void startTask(task.id)}
                        className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-luxury-navy-rich px-4 py-3 text-sm font-black text-white shadow-sm hover:bg-luxury-charcoal disabled:opacity-60 md:flex-none"
                      >
                        {actionId === task.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                        ) : (
                          <Play className="h-4 w-4 fill-current" aria-hidden />
                        )}
                        התחל עבודה
                      </button>
                    ) : null}
                    {task.status === "in_progress" ? (
                      <button
                        type="button"
                        disabled={actionId === task.id}
                        onClick={() => void completeTask(task.id)}
                        className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-black text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60 md:flex-none"
                      >
                        {actionId === task.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                        ) : (
                          <Check className="h-4 w-4" aria-hidden />
                        )}
                        סיים משימה
                      </button>
                    ) : null}
                    {task.status === "completed" ? (
                      <span className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-900">
                        <Check className="h-4 w-4" aria-hidden />
                        הושלמה
                      </span>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="app-panel p-5 text-center text-xs text-slate-500">
        <p>זמן משמרת מקומי (לא נשמר במערכת)</p>
        <LocalTimer />
      </section>
    </div>
  );
}

function LocalTimer() {
  const [running, setRunning] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, []);

  const liveElapsedMs =
    running && startedAt !== null ? elapsedMs + (now - startedAt) : elapsedMs;

  const toggle = () => {
    if (!running) {
      setRunning(true);
      setStartedAt(Date.now());
      return;
    }
    if (startedAt !== null) {
      setElapsedMs((prev) => prev + (Date.now() - startedAt));
    }
    setRunning(false);
    setStartedAt(null);
  };

  const mm = String(Math.floor(liveElapsedMs / 60000)).padStart(2, "0");
  const ss = String(Math.floor((liveElapsedMs % 60000) / 1000)).padStart(2, "0");

  return (
    <div className="mt-4 flex flex-wrap items-center justify-center gap-4">
      <p className="text-2xl font-black tabular-nums text-slate-800">
        {mm}:{ss}
      </p>
      <button
        type="button"
        onClick={toggle}
        className={`inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-black text-white shadow ${
          running ? "bg-luxury-navy-rich hover:bg-luxury-charcoal" : "bg-emerald-600 hover:bg-emerald-700"
        }`}
      >
        {running ? (
          <>
            <Square className="h-4 w-4 fill-current" aria-hidden />
            עצור
          </>
        ) : (
          <>
            <Play className="h-4 w-4 fill-current" aria-hidden />
            התחל
          </>
        )}
      </button>
    </div>
  );
}
