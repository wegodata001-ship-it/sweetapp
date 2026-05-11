"use client";

import {
  AlertTriangle,
  CheckSquare,
  ClipboardList,
  Loader2,
  Play,
  Square,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  EMPLOYEE_TASK_STATUS_KEYS,
  PRIORITY_LABELS,
  WORKER_STATUS_LABELS,
} from "@/lib/tasks/helpers";
import type { SerializedEmployeeTask } from "@/lib/tasks/serialize-task";

type MyStats = {
  open: number;
  in_progress: number;
  completed: number;
  urgent_open: number;
  overdue: number;
};

function formatDay(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("he-IL", {
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function plannedTimeRange(task: SerializedEmployeeTask) {
  return `${task.start_time} - ${task.end_time || "..."}`;
}

const PRI_BADGE: Record<string, string> = {
  normal: "border-slate-200 bg-slate-100 text-slate-700",
  high: "border-amber-300 bg-amber-50 text-amber-950",
  urgent: "border-red-500 bg-red-50 text-red-950",
  low: "border-slate-200 bg-slate-100 text-slate-600",
  medium: "border-slate-200 bg-slate-100 text-slate-700",
};

const STATUS_ROW: Record<string, string> = {
  pending: "bg-slate-50 border-slate-200",
  in_progress: "bg-amber-50/80 border-amber-200",
  completed: "bg-emerald-50/80 border-emerald-200",
  problem: "bg-rose-50/80 border-rose-200",
  rejected: "bg-slate-100 border-slate-300",
};

export default function EmployeeTasksPage() {
  const [tasks, setTasks] = useState<SerializedEmployeeTask[]>([]);
  const [stats, setStats] = useState<MyStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notesDraft, setNotesDraft] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/tasks/my", { credentials: "same-origin" });
      if (res.status === 401) {
        setError("נדרשת התחברות");
        return;
      }
      if (res.status === 403) {
        setError("אין הרשאה");
        return;
      }
      const j = (await res.json()) as {
        data?: SerializedEmployeeTask[];
        stats?: MyStats;
      };
      setTasks(j.data ?? []);
      if (j.stats) setStats(j.stats);
    } catch {
      setError("טעינה נכשלה");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, [load]);

  const patch = async (id: string, body: Record<string, unknown>) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/tasks/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(body),
      });
      if (res.ok) await load();
    } finally {
      setBusyId(null);
    }
  };

  const startWork = async (id: string) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/tasks/${encodeURIComponent(id)}/start`, {
        method: "POST",
        credentials: "same-origin",
      });
      if (res.ok) await load();
    } finally {
      setBusyId(null);
    }
  };

  const completeWork = async (id: string) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/tasks/${encodeURIComponent(id)}/complete`, {
        method: "POST",
        credentials: "same-origin",
      });
      if (res.ok) await load();
    } finally {
      setBusyId(null);
    }
  };

  const flushNote = async (id: string) => {
    const text = notesDraft[id];
    if (text === undefined) return;
    await patch(id, { employeeNote: text });
  };

  const inputClass =
    "mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none focus:border-luxury-gold focus:ring-2 focus:ring-luxury-gold/25";

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-3 pb-12 sm:px-4" dir="rtl">
      <section className="app-panel p-5 md:p-8">
        <p className="flex items-center gap-2 text-sm font-bold tracking-[0.12em] text-luxury-navy-rich">
          <ClipboardList className="h-4 w-4 text-luxury-gold" aria-hidden />
          המשימות שלי
        </p>
        <h1 className="mt-3 text-2xl font-black text-slate-950 md:text-3xl">המשימות שלי</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          כאן מופיעות כל המשימות שהוקצו לך — לפי המשתמש המחובר, בלי בחירת עובד.
        </p>
        {error ? (
          <p className="mt-4 text-sm font-bold text-rose-700" role="alert">
            {error}
          </p>
        ) : null}
      </section>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="app-panel border-blue-200/80 p-4 shadow-luxury-sm">
          <p className="text-xs font-bold text-slate-500">משימות פתוחות</p>
          <p className="mt-2 text-2xl font-black text-blue-800 tabular-nums">{stats?.open ?? "—"}</p>
        </div>
        <div className="app-panel border-amber-200/80 p-4 shadow-luxury-sm">
          <p className="text-xs font-bold text-slate-500">בטיפול</p>
          <p className="mt-2 text-2xl font-black text-amber-800 tabular-nums">{stats?.in_progress ?? "—"}</p>
        </div>
        <div className="app-panel border-emerald-200/80 p-4 shadow-luxury-sm">
          <p className="text-xs font-bold text-slate-500">הושלמו</p>
          <p className="mt-2 text-2xl font-black text-emerald-800 tabular-nums">{stats?.completed ?? "—"}</p>
        </div>
        <div className="app-panel border-red-200/80 p-4 shadow-luxury-sm">
          <p className="text-xs font-bold text-slate-500">דחופות פתוחות</p>
          <p className="mt-2 text-2xl font-black text-red-800 tabular-nums">{stats?.urgent_open ?? "—"}</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-20 text-slate-600">
          <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
          טוען משימות…
        </div>
      ) : tasks.length === 0 ? (
        <div className="app-panel flex flex-col items-center gap-4 py-16 text-center">
          <CheckSquare className="h-14 w-14 text-slate-300" aria-hidden />
          <p className="text-lg font-black text-slate-800">אין משימות שהוקצו לך כרגע</p>
        </div>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-2xl border border-slate-200 md:block">
            <div className="max-h-[min(72vh,680px)] overflow-auto">
              <table className="min-w-full divide-y divide-slate-200 text-right text-sm">
                <thead className="sticky top-0 z-10 bg-slate-50 shadow-sm">
                  <tr>
                    <th className="px-4 py-3.5 font-bold text-slate-700">כותרת</th>
                    <th className="px-4 py-3.5 font-bold text-slate-700">דחיפות</th>
                    <th className="px-4 py-3.5 font-bold text-slate-700">סטטוס</th>
                    <th className="px-4 py-3.5 font-bold text-slate-700">תאריך</th>
                    <th className="px-4 py-3.5 font-bold text-slate-700">התחלה</th>
                    <th className="px-4 py-3.5 font-bold text-slate-700">סיום</th>
                    <th className="px-4 py-3.5 font-bold text-slate-700">פעולות</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {tasks.map((task) => {
                    const pr = PRI_BADGE[task.priority] ?? PRI_BADGE.normal;
                    const rowTone = STATUS_ROW[task.status] ?? "bg-white";
                    const canStart =
                      task.status !== "completed" &&
                      task.status !== "rejected" &&
                      task.status !== "in_progress";
                    const canComplete =
                      task.status !== "completed" && task.status !== "rejected";
                    return (
                      <tr key={task.id} className={`${rowTone} transition hover:bg-white/90`}>
                        <td className="px-4 py-3 align-top">
                          <span className="font-bold text-slate-900">{task.title}</span>
                          {task.deadline_passed ? (
                            <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-black text-white">
                              <AlertTriangle className="h-3 w-3" aria-hidden />
                              באיחור
                            </span>
                          ) : null}
                          <label className="mt-2 block text-xs font-bold text-slate-500">הערת עובד</label>
                          <textarea
                            value={notesDraft[task.id] ?? task.employee_note ?? ""}
                            onChange={(e) =>
                              setNotesDraft((p) => ({ ...p, [task.id]: e.target.value }))
                            }
                            onBlur={() => void flushNote(task.id)}
                            rows={2}
                            className={`${inputClass} mt-1 resize-y text-xs`}
                            placeholder="חסר חומר, טופל, צריך אישור…"
                          />
                        </td>
                        <td className="px-4 py-3 align-top">
                          <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-black ${pr}`}>
                            {PRIORITY_LABELS[task.priority] ?? task.priority}
                          </span>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <select
                            value={task.status}
                            disabled={busyId === task.id}
                            onChange={(e) =>
                              void patch(task.id, { status: e.target.value })
                            }
                            className="rounded-xl border border-slate-200 bg-white px-2 py-2 text-xs font-bold text-slate-900"
                          >
                            {EMPLOYEE_TASK_STATUS_KEYS.map((k) => (
                              <option key={k} value={k}>
                                {WORKER_STATUS_LABELS[k]}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-3 align-top tabular-nums text-slate-700">
                          {formatDay(task.task_date)}
                        </td>
                        <td className="px-4 py-3 align-top text-xs text-slate-600">
                          <span className="font-black text-slate-900">{task.start_time}</span>
                        </td>
                        <td className="px-4 py-3 align-top text-xs text-slate-600">
                          <span className="font-black text-slate-900">{task.end_time || "..."}</span>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <div className="flex flex-col gap-2">
                            <button
                              type="button"
                              disabled={!canStart || busyId === task.id}
                              onClick={() => void startWork(task.id)}
                              className="inline-flex items-center justify-center gap-1 rounded-xl bg-luxury-navy-rich px-3 py-2 text-xs font-black text-white shadow-sm hover:bg-luxury-charcoal disabled:opacity-40"
                            >
                              <Play className="h-3.5 w-3.5" aria-hidden />
                              התחל עבודה
                            </button>
                            <button
                              type="button"
                              disabled={!canComplete || busyId === task.id}
                              onClick={() => void completeWork(task.id)}
                              className="inline-flex items-center justify-center gap-1 rounded-xl border border-emerald-500/40 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-900 disabled:opacity-40"
                            >
                              <Square className="h-3.5 w-3.5" aria-hidden />
                              סיימתי
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-4 md:hidden">
            {tasks.map((task) => {
              const pr = PRI_BADGE[task.priority] ?? PRI_BADGE.normal;
              const canStart =
                task.status !== "completed" &&
                task.status !== "rejected" &&
                task.status !== "in_progress";
              const canComplete = task.status !== "completed" && task.status !== "rejected";
              return (
                <article
                  key={task.id}
                  className={`app-panel space-y-3 p-4 ${STATUS_ROW[task.status] ?? ""}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h2 className="text-base font-black text-slate-950">{task.title}</h2>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black ${pr}`}>
                      {PRIORITY_LABELS[task.priority] ?? task.priority}
                    </span>
                  </div>
                  {task.deadline_passed ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-black text-white">
                      <AlertTriangle className="h-3 w-3" aria-hidden />
                      באיחור
                    </span>
                  ) : null}
                  <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
                    <div>
                      <span className="font-bold text-slate-500">תאריך</span>
                      <p className="font-semibold text-slate-900">{formatDay(task.task_date)}</p>
                    </div>
                    <div>
                      <span className="font-bold text-slate-500">שעות מתוכננות</span>
                      <p className="font-semibold text-slate-900">{plannedTimeRange(task)}</p>
                    </div>
                  </div>
                  <label className="block text-xs font-bold text-slate-600">סטטוס</label>
                  <select
                    value={task.status}
                    disabled={busyId === task.id}
                    onChange={(e) => void patch(task.id, { status: e.target.value })}
                    className={inputClass}
                  >
                    {EMPLOYEE_TASK_STATUS_KEYS.map((k) => (
                      <option key={k} value={k}>
                        {WORKER_STATUS_LABELS[k]}
                      </option>
                    ))}
                  </select>
                  <label className="block text-xs font-bold text-slate-600">הערת עובד</label>
                  <textarea
                    value={notesDraft[task.id] ?? task.employee_note ?? ""}
                    onChange={(e) => setNotesDraft((p) => ({ ...p, [task.id]: e.target.value }))}
                    onBlur={() => void flushNote(task.id)}
                    rows={3}
                    className={`${inputClass} resize-y`}
                    placeholder="הערת עובד…"
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={!canStart || busyId === task.id}
                      onClick={() => void startWork(task.id)}
                      className="inline-flex flex-1 items-center justify-center gap-1 rounded-xl bg-luxury-navy-rich px-3 py-2.5 text-xs font-black text-white disabled:opacity-40"
                    >
                      <Play className="h-4 w-4" aria-hidden />
                      התחל עבודה
                    </button>
                    <button
                      type="button"
                      disabled={!canComplete || busyId === task.id}
                      onClick={() => void completeWork(task.id)}
                      className="inline-flex flex-1 items-center justify-center gap-1 rounded-xl border border-emerald-500/50 bg-emerald-50 px-3 py-2.5 text-xs font-black text-emerald-900 disabled:opacity-40"
                    >
                      סיימתי
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
