"use client";

import {
  AlertTriangle,
  Check,
  ClipboardList,
  Clock3,
  Filter,
  Flame,
  Flag,
  LayoutGrid,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Table,
  Trash2,
  UserRound,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  EMPLOYEE_TASK_STATUS_KEYS,
  MANAGER_TASK_PRIORITIES,
  PRIORITY_LABELS,
  STATUS_LABELS,
  WORKER_STATUS_LABELS,
  priorityLabel,
  type TaskEffectiveStatus,
} from "@/lib/tasks/helpers";
import { formatDateInputLocal } from "@/lib/tasks/schedule";
import type { SerializedEmployeeTask } from "@/lib/tasks/serialize-task";

/** משתמשי EMPLOYEE פעילים — מקור: User, לא Employee */
type TaskAssigneeUser = {
  id: string;
  fullName: string;
  email: string;
  role: string;
};

type TaskStats = {
  open_by_employee: { employee_id: string; name: string; open_count: number }[];
  total_open: number;
  total_completed: number;
  progress: { done: number; total: number };
  dashboard?: {
    total: number;
    in_progress: number;
    completed: number;
    overdue: number;
    urgent_open: number;
    completed_today?: number;
    top_busy?: { employee_id: string; name: string; open_count: number } | null;
  };
};

type TaskRow = SerializedEmployeeTask;

const DEPT_DOT: Record<string, string> = {
  מטבח: "bg-amber-500",
  אריזה: "bg-violet-500",
  ייצור: "bg-emerald-500",
  קירור: "bg-cyan-500",
};

const PRIORITY_STYLES: Record<string, string> = {
  normal: "border-slate-300 bg-slate-100 text-slate-800",
  low: "border-slate-200 bg-slate-100 text-slate-700",
  medium: "border-slate-200 bg-slate-100 text-slate-700",
  high: "border-amber-400 bg-amber-50 text-amber-950",
  urgent:
    "border-red-500 bg-red-50 text-red-950 shadow-[0_0_18px_rgba(239,68,68,0.42)]",
};

const TAB_OPTIONS = [
  { id: "all", label: "כל המשימות" },
  { id: "in_progress", label: "בטיפול" },
  { id: "mine", label: "שלי" },
  { id: "overdue", label: "באיחור" },
  { id: "completed", label: "הושלמו" },
] as const;

function deptDotClass(dept: string | null) {
  if (!dept || !DEPT_DOT[dept]) return "bg-slate-400";
  return DEPT_DOT[dept];
}

function formatTaskDay(iso: string) {
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

function scheduledLabel(task: TaskRow) {
  return `${formatTaskDay(task.task_date)} · ${timeRangeLabel(task)}`;
}

function timeRangeLabel(task: TaskRow) {
  return `${task.start_time} - ${task.end_time || "..."}`;
}

function formatRemain(ms: number) {
  if (ms <= 0) return "—";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h >= 48) return `${Math.floor(h / 24)} ימים`;
  if (h > 0) return `${h}ש ${m}דק`;
  return `${m} דק׳`;
}

function formatDuration(ms: number | null) {
  if (ms == null || ms < 0) return "—";
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 72) return `${Math.floor(h / 24)} ימים`;
  if (h > 0) return `${h}ש ${m}דק`;
  return `${m} דק׳`;
}

/** עד שעת ההתחלה המתוזמנת — או באיחור אם ממתינה וכבר עברה השעה */
function formatRemainOrLateTask(task: TaskRow) {
  if (task.status === "completed") return { overdue: false as const, text: "—" };
  const schedMs = task.scheduled_start_ms;
  const now = Date.now();
  if (task.status === "pending" && now > schedMs) {
    return {
      overdue: true as const,
      text: `⚠ באיחור · עבר לפני ${formatRemain(now - schedMs)}`,
    };
  }
  if (task.status === "pending") {
    return { overdue: false as const, text: formatRemain(schedMs - now) };
  }
  return { overdue: false as const, text: "—" };
}

function employeeInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase() || "?";
}

function cardShell(eff: TaskEffectiveStatus, urgentGlow: boolean) {
  const base =
    "relative flex h-full min-h-[240px] w-full max-w-[320px] flex-col rounded-[18px] border bg-white p-3 shadow-sm transition";
  if (urgentGlow && eff !== "completed") {
    return `${base} border-red-500 ring-2 ring-red-400/55 shadow-[0_0_22px_rgba(239,68,68,0.28)]`;
  }
  if (eff === "overdue") return `${base} border-rose-400 ring-2 ring-rose-300/50`;
  if (eff === "completed") return `${base} border-emerald-300 bg-emerald-50/25`;
  if (eff === "problem") return `${base} border-rose-500 bg-rose-50/20`;
  if (eff === "rejected") return `${base} border-slate-400 bg-slate-100/40`;
  if (eff === "in_progress") return `${base} border-blue-400 bg-blue-50/30`;
  return `${base} border-slate-200 bg-slate-50/40`;
}

export default function AdminTasksPage() {
  const [employees, setEmployees] = useState<TaskAssigneeUser[]>([]);
  const [employeesError, setEmployeesError] = useState<string | null>(null);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [stats, setStats] = useState<TaskStats | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selectedAssigneeIds, setSelectedAssigneeIds] = useState<string[]>([]);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [taskDateField, setTaskDateField] = useState("");
  const [scheduledStartTime, setScheduledStartTime] = useState("08:00");
  const [scheduledEndTime, setScheduledEndTime] = useState("");
  const [taskDueDate, setTaskDueDate] = useState("");
  const [priority, setPriority] = useState<(typeof MANAGER_TASK_PRIORITIES)[number]>("normal");
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState(false);
  const [timeTick, setTimeTick] = useState(0);

  const [tab, setTab] = useState<(typeof TAB_OPTIONS)[number]["id"]>("all");
  const [filterQ, setFilterQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [filterAssignee, setFilterAssignee] = useState("");
  const [filterPriority, setFilterPriority] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [groupModalId, setGroupModalId] = useState<string | null>(null);

  const { groupEntries, soloTasks } = useMemo(() => {
    const g = new Map<string, TaskRow[]>();
    const solo: TaskRow[] = [];
    for (const t of tasks) {
      if (t.group_id) {
        if (!g.has(t.group_id)) g.set(t.group_id, []);
        g.get(t.group_id)!.push(t);
      } else solo.push(t);
    }
    for (const arr of g.values()) {
      arr.sort((a, b) => a.assignee.fullName.localeCompare(b.assignee.fullName, "he"));
    }
    return { groupEntries: [...g.entries()], soloTasks: solo };
  }, [tasks]);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(filterQ), 380);
    return () => window.clearTimeout(t);
  }, [filterQ]);

  const loadEmployees = useCallback(async () => {
    setEmployeesError(null);
    try {
      const res = await fetch("/api/employees?forTasks=1", { credentials: "same-origin" });
      if (!res.ok) {
        setEmployees([]);
        setEmployeesError(
          res.status === 403 ? "אין הרשאה לטעון עובדים (נדרשת הרשאת משימות)." : "טעינת עובדים נכשלה.",
        );
        return;
      }
      const j = (await res.json()) as { data?: TaskAssigneeUser[] };
      setEmployees(j.data ?? []);
    } catch {
      setEmployees([]);
      setEmployeesError("טעינת עובדים נכשלה.");
    }
  }, []);

  const loadTasks = useCallback(async () => {
    setLoadError(null);
    try {
      const params = new URLSearchParams();
      const useAdvFilters = Boolean(filterStatus) || onlyOverdue || onlyOpen;
      params.set("tab", useAdvFilters ? "all" : tab);
      if (debouncedQ.trim()) params.set("q", debouncedQ.trim());
      if (filterAssignee) params.set("assigneeId", filterAssignee);
      if (filterPriority) params.set("priority", filterPriority);
      if (filterDateFrom) params.set("dateFrom", filterDateFrom);
      if (filterDateTo) params.set("dateTo", filterDateTo);
      if (filterStatus) params.set("filterStatus", filterStatus);
      if (onlyOverdue) params.set("onlyOverdue", "1");
      if (onlyOpen) params.set("onlyOpen", "1");

      const res = await fetch(`/api/tasks?${params.toString()}`, { credentials: "same-origin" });
      if (res.status === 503) {
        setLoadError("אין חיבור למסד — הגדרו DATABASE_URL");
        return;
      }
      const j = (await res.json()) as {
        data?: TaskRow[];
        stats?: TaskStats;
        ok?: boolean;
      };
      if (j.data) setTasks(j.data);
      if (j.stats) setStats(j.stats);
    } catch {
      setLoadError("טעינה נכשלה");
    }
  }, [
    tab,
    debouncedQ,
    filterAssignee,
    filterPriority,
    filterDateFrom,
    filterDateTo,
    filterStatus,
    onlyOverdue,
    onlyOpen,
  ]);

  useEffect(() => {
    queueMicrotask(() => {
      void loadEmployees();
    });
  }, [loadEmployees]);

  useEffect(() => {
    queueMicrotask(() => {
      void loadTasks();
    });
  }, [loadTasks]);

  useEffect(() => {
    const id = window.setInterval(() => void loadTasks(), 45000);
    return () => window.clearInterval(id);
  }, [loadTasks]);

  useEffect(() => {
    const id = window.setInterval(() => setTimeTick((t) => t + 1), 30000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!createSuccess) return;
    const id = window.setTimeout(() => setCreateSuccess(false), 6000);
    return () => window.clearTimeout(id);
  }, [createSuccess]);

  const dash = stats?.dashboard;

  const submitTask = async () => {
    setCreateError(null);
    if (
      selectedAssigneeIds.length === 0 ||
      !taskTitle.trim() ||
      !taskDateField.trim() ||
      !scheduledStartTime.trim()
    ) {
      setCreateError("חובה לבחור עובד, כותרת, תאריך ושעת התחלה.");
      return;
    }
    if (scheduledEndTime.trim() && scheduledEndTime.trim() < scheduledStartTime.trim()) {
      setCreateError("שעת סיום חייבת להיות אחרי שעת ההתחלה.");
      return;
    }
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        assigneeIds: selectedAssigneeIds,
        title: taskTitle.trim(),
        description: taskDescription.trim() || null,
        taskDate: taskDateField.trim(),
        startTime: scheduledStartTime.trim(),
        endTime: scheduledEndTime.trim() || null,
        dueDate: taskDueDate.trim() || null,
        priority,
      }),
      credentials: "same-origin",
    });
    if (!res.ok) {
      const j = (await res.json().catch(() => null)) as { error?: string } | null;
      setCreateError(j?.error ?? "שמירת המשימה נכשלה.");
      return;
    }
    setTaskTitle("");
    setTaskDescription("");
    setTaskDateField("");
    setScheduledStartTime("08:00");
    setScheduledEndTime("");
    setTaskDueDate("");
    setPriority("normal");
    setSelectedAssigneeIds([]);
    setCreateSuccess(true);
    await loadTasks();
  };

  const toggleAssignee = (id: string) => {
    setSelectedAssigneeIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const patchTask = async (id: string, patch: Record<string, unknown>) => {
    const res = await fetch(`/api/tasks/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
      credentials: "same-origin",
    });
    if (res.ok) await loadTasks();
  };

  const deleteTask = async (id: string) => {
    if (!window.confirm("למחוק משימה זו?")) return;
    await fetch(`/api/tasks/${encodeURIComponent(id)}`, { method: "DELETE", credentials: "same-origin" });
    await loadTasks();
    if (editingId === id) setEditingId(null);
  };

  const inputClass =
    "mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-right text-sm font-semibold text-slate-900 outline-none focus:border-luxury-gold focus:ring-2 focus:ring-luxury-gold/25";

  const labelClass = "block text-sm font-bold text-slate-700";

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <section className="app-panel p-6 md:p-8">
        <p className="flex items-center gap-2 text-sm font-bold tracking-[0.12em] text-violet-700">
          <ClipboardList className="h-4 w-4" aria-hidden />
          ניהול משימות לעובדים
        </p>
        <h1 className="mt-3 text-2xl font-black text-slate-950 md:text-3xl">הקצאה ומעקב משימות</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          עובדים מהמסד, סטטוסים אמיתיים, התחלה וסיום — לפי המערכת.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href="/admin/forms"
            className="inline-flex items-center gap-2 rounded-xl border border-luxury-navy-rich/20 bg-white px-4 py-2 text-sm font-bold text-luxury-navy-rich shadow-sm hover:bg-slate-50"
          >
            <LayoutGrid className="h-4 w-4" aria-hidden />
            טפסים (שדות דינמיים)
          </Link>
        </div>
        {loadError && (
          <p className="mt-4 text-sm font-bold text-amber-800" role="alert">
            {loadError}
          </p>
        )}
      </section>

      <section className="app-panel p-5 md:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Plus className="h-5 w-5 text-luxury-gold" aria-hidden />
          <h2 className="text-lg font-black text-slate-950">הקצאת משימה</h2>
        </div>
        <p className="mt-2 text-xs font-semibold text-slate-500">
          המשימה נוצרת כ<span className="font-black text-slate-700">ממתינה</span> — העובד מפעיל התחלה וסיום בפורטל שלו.
        </p>

        {createSuccess ? (
          <div
            className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-900 shadow-sm"
            role="status"
          >
            <Check className="h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
            המשימה נשלחה לעובד בהצלחה
          </div>
        ) : null}
        {createError ? (
          <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-800" role="alert">
            {createError}
          </p>
        ) : null}

        {employeesError ? (
          <p className="mt-4 text-sm font-bold text-rose-700" role="alert">
            {employeesError}
          </p>
        ) : null}

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <span className={labelClass}>
              <span className="flex items-center gap-2">
                <UserRound className="h-4 w-4 text-slate-500" aria-hidden />
                עובדים (ניתן לבחור כמה)
              </span>
            </span>
            {employees.length === 0 && !employeesError ? (
              <div className="mt-2 rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 p-6 text-center shadow-inner">
                <p className="text-sm font-black text-slate-800">אין עובדים פעילים במערכת</p>
                <p className="mt-1 text-xs text-slate-600">
                  ניהול עובדים (משתמשים בתפקיד EMPLOYEE) מתבצע במסך ניהול משתמשים.
                </p>
                <Link
                  href="/admin/users"
                  className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl border border-luxury-navy-rich/25 bg-white px-4 py-2.5 text-sm font-black text-luxury-navy-rich shadow-sm hover:bg-slate-50"
                >
                  מעבר לניהול משתמשים
                </Link>
              </div>
            ) : (
              <div className="mt-2 grid max-h-56 gap-2 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50/50 p-3">
                {employees.map((a) => (
                  <label
                    key={a.id}
                    className="flex cursor-pointer items-center gap-3 rounded-xl border border-transparent bg-white px-3 py-2.5 shadow-sm transition hover:border-luxury-gold/40"
                  >
                    <input
                      type="checkbox"
                      checked={selectedAssigneeIds.includes(a.id)}
                      onChange={() => toggleAssignee(a.id)}
                      className="h-4 w-4 shrink-0 rounded border-slate-300 text-luxury-navy-rich focus:ring-luxury-gold"
                    />
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center text-lg" aria-hidden>
                      👤
                    </span>
                    <span className="min-w-0 flex-1 text-right">
                      <span className="block truncate font-black text-slate-950">{a.fullName}</span>
                      <span className="block truncate text-xs font-semibold text-slate-500">{a.email}</span>
                    </span>
                    <span className="shrink-0 rounded-full bg-luxury-gold/20 px-2 py-0.5 text-[10px] font-black text-luxury-navy-rich">
                      {a.role}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <label className={labelClass}>
            <span className="flex items-center gap-2">
              <span aria-hidden>📅</span>
              תאריך משימה
            </span>
            <input
              type="date"
              value={taskDateField}
              onChange={(e) => setTaskDateField(e.target.value)}
              className={inputClass}
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className={labelClass}>
              <span className="flex items-center gap-2">
                <Clock3 className="h-4 w-4 text-slate-500" aria-hidden />
                שעת התחלה
              </span>
              <input
                type="time"
                value={scheduledStartTime}
                onChange={(e) => setScheduledStartTime(e.target.value)}
                className={inputClass}
              />
            </label>
            <label className={labelClass}>
              <span className="flex items-center gap-2">
                <Flag className="h-4 w-4 text-slate-500" aria-hidden />
                שעת סיום
              </span>
              <input
                type="time"
                value={scheduledEndTime}
                onChange={(e) => setScheduledEndTime(e.target.value)}
                className={inputClass}
              />
            </label>
        </div>

          <label className={labelClass}>
            <span className="flex items-center gap-2">
              <span aria-hidden>🎯</span>
              יעד (אופציונלי)
            </span>
            <input
              type="date"
              value={taskDueDate}
              onChange={(e) => setTaskDueDate(e.target.value)}
              className={inputClass}
            />
          </label>

          <label className="md:col-span-2">
            <span className={labelClass}>כותרת משימה *</span>
            <input
              type="text"
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              className={inputClass}
              placeholder="למשל: הכנת מגשי כנאפה"
              required
            />
          </label>

          <label className="md:col-span-2">
            <span className={labelClass}>עדיפות</span>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as (typeof MANAGER_TASK_PRIORITIES)[number])}
              className={inputClass}
            >
              {MANAGER_TASK_PRIORITIES.map((k) => (
                <option key={k} value={k}>
                  {PRIORITY_LABELS[k]}
                </option>
              ))}
            </select>
          </label>

          <label className="md:col-span-2">
            <span className={labelClass}>תיאור משימה</span>
            <textarea
              value={taskDescription}
              onChange={(e) => setTaskDescription(e.target.value)}
              className={`${inputClass} min-h-[120px] resize-y leading-relaxed`}
              placeholder="פרטי המשימה, מיקום, הערות, מספר הזמנה וכו׳"
              rows={5}
            />
          </label>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
            onClick={() => void submitTask()}
            disabled={employees.length === 0 || selectedAssigneeIds.length === 0}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-luxury-gold px-5 py-3 text-sm font-black text-luxury-charcoal shadow-luxury-sm hover:bg-luxury-gold-hover disabled:pointer-events-none disabled:opacity-50"
            >
            <SendMini />
              הקצאת משימה
            </button>
        </div>
      </section>

      {dash ? (
        <section className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
          {[
            { k: "total", label: "סה״כ משימות", value: dash.total, tone: "bg-slate-100 text-slate-900 border-slate-200" },
            { k: "in_progress", label: "בטיפול", value: dash.in_progress, tone: "bg-blue-50 text-blue-950 border-blue-200" },
            { k: "completed", label: "הושלמו", value: dash.completed, tone: "bg-emerald-50 text-emerald-950 border-emerald-200" },
            { k: "overdue", label: "באיחור", value: dash.overdue, tone: "bg-rose-50 text-rose-950 border-rose-200" },
            { k: "urgent_open", label: "דחופות פתוחות", value: dash.urgent_open, tone: "bg-orange-50 text-orange-950 border-orange-300" },
            {
              k: "completed_today",
              label: "הושלמו היום",
              value: dash.completed_today ?? 0,
              tone: "bg-teal-50 text-teal-950 border-teal-200",
            },
            {
              k: "top_busy",
              label: "עמוס ביותר",
              value: dash.top_busy?.name
                ? `${dash.top_busy.name} (${dash.top_busy.open_count})`
                : "—",
              tone: "bg-violet-50 text-violet-950 border-violet-200",
              wide: true,
            },
          ].map((c) => (
            <div
              key={c.k}
              className={`rounded-2xl border px-4 py-3 shadow-sm ${c.tone} ${"wide" in c && c.wide ? "col-span-2 lg:col-span-1" : ""}`}
            >
              <p className="text-[11px] font-bold opacity-80">{c.label}</p>
              <p className="mt-1 text-xl font-black tabular-nums md:text-2xl">{c.value}</p>
        </div>
          ))}
        </section>
      ) : null}

      <section className="app-panel p-5 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <LayoutGrid className="h-5 w-5 text-luxury-navy-rich" aria-hidden />
            <h2 className="text-lg font-black text-slate-950">לוח משימות</h2>
                </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
              <button
                type="button"
                onClick={() => setViewMode("cards")}
                className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-black ${
                  viewMode === "cards" ? "bg-white text-luxury-navy-rich shadow-sm" : "text-slate-600"
                }`}
              >
                <LayoutGrid className="h-3.5 w-3.5" aria-hidden />
                כרטיסים
              </button>
                <button
                  type="button"
                onClick={() => setViewMode("table")}
                className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-black ${
                  viewMode === "table" ? "bg-white text-luxury-navy-rich shadow-sm" : "text-slate-600"
                }`}
              >
                <Table className="h-3.5 w-3.5" aria-hidden />
                טבלה
                </button>
              </div>
            {stats?.progress && stats.progress.total > 0 ? (
              <p className="text-sm font-bold text-slate-600">
                התקדמות:{" "}
                <span className="text-emerald-700">
                  {stats.progress.done}/{stats.progress.total} הושלמו
                </span>
              </p>
            ) : null}
          </div>
        </div>

        {stats?.open_by_employee && stats.open_by_employee.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {stats.open_by_employee.map((e) => (
              <span
                key={e.employee_id}
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-bold text-slate-800 shadow-sm"
              >
                <span className={`h-2 w-2 rounded-full ${deptDotClass(null)}`} aria-hidden />
                {e.name}
                <span className="rounded-md bg-luxury-navy-rich/10 px-1.5 text-luxury-navy-rich">
                  {e.open_count}
                </span>
              </span>
            ))}
              </div>
        ) : null}

        <div className="mt-5 flex flex-wrap gap-2 border-b border-slate-100 pb-3">
          {TAB_OPTIONS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`rounded-full px-4 py-2 text-xs font-black transition ${
                tab === t.id
                  ? "bg-luxury-navy-rich text-white shadow-sm"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 xl:col-span-2">
            <Search className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
            <input
              value={filterQ}
              onChange={(e) => setFilterQ(e.target.value)}
              className="min-w-0 flex-1 border-0 bg-transparent text-sm font-semibold text-slate-900 outline-none"
              placeholder="חיפוש משימה / עובד…"
            />
          </label>
          <select
            value={filterAssignee}
            onChange={(e) => setFilterAssignee(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900"
          >
            <option value="">כל העובדים</option>
            {employees.map((a) => (
              <option key={a.id} value={a.id}>
                {a.fullName}
              </option>
            ))}
          </select>
          <select
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900"
          >
            <option value="">כל העדיפויות</option>
            {(Object.keys(PRIORITY_LABELS) as Array<keyof typeof PRIORITY_LABELS>).map((k) => (
              <option key={k} value={k}>
                {PRIORITY_LABELS[k]}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <input
              type="date"
              value={filterDateFrom}
              onChange={(e) => setFilterDateFrom(e.target.value)}
              className="min-w-0 flex-1 rounded-xl border border-slate-200 px-2 py-2 text-xs font-semibold"
            />
            <input
              type="date"
              value={filterDateTo}
              onChange={(e) => setFilterDateTo(e.target.value)}
              className="min-w-0 flex-1 rounded-xl border border-slate-200 px-2 py-2 text-xs font-semibold"
            />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-3">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900"
          >
            <option value="">כל הסטטוסים</option>
            {EMPLOYEE_TASK_STATUS_KEYS.map((k) => (
              <option key={k} value={k}>
                {WORKER_STATUS_LABELS[k]}
              </option>
            ))}
          </select>
          <label className="flex cursor-pointer items-center gap-2 text-sm font-bold text-slate-800">
            <input
              type="checkbox"
              checked={onlyOpen}
              onChange={(e) => setOnlyOpen(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
            />
            רק פתוחות
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm font-bold text-slate-800">
          <input
              type="checkbox"
              checked={onlyOverdue}
              onChange={(e) => setOnlyOverdue(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
            />
            רק באיחור
          </label>
        </div>
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            onClick={() => void loadTasks()}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
          >
            <Filter className="h-3.5 w-3.5" aria-hidden />
            רענון
          </button>
        </div>

        <div className="mt-4 max-h-[min(70vh,720px)] overflow-y-auto pr-1">
          {tasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
              <div className="rounded-full border border-slate-200 bg-slate-50 p-6 shadow-inner">
                <ClipboardList className="h-14 w-14 text-luxury-navy-rich/35" aria-hidden />
              </div>
              <div>
                <p className="text-lg font-black text-slate-900">אין משימות פעילות כרגע</p>
                <p className="mt-1 text-sm text-slate-600">נסו לשנות סינון או טאב, או הקצו משימה חדשה.</p>
              </div>
            </div>
          ) : viewMode === "cards" ? (
            <div className="grid grid-cols-1 justify-items-stretch gap-2.5 sm:grid-cols-[repeat(auto-fill,minmax(min(100%,300px),320px))]">
              {groupEntries.map(([gid, members]) => {
                const head = members[0]!;
                void timeTick;
                const eff = head.effective_status as TaskEffectiveStatus;
                const urgentOpen = head.priority === "urgent" && members.some((m) => m.status !== "completed");
                const overdueUi = members.some((m) => m.deadline_passed);
                const pr = PRIORITY_STYLES[head.priority] ?? PRIORITY_STYLES.normal;
                return (
                  <article key={gid} className={cardShell(eff, urgentOpen)}>
                    {urgentOpen ? (
                      <div className="absolute end-3 top-3 flex items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-black uppercase text-white shadow-md shadow-red-500/30">
                        <Flame className="h-3 w-3" aria-hidden />
                        דחופה
                      </div>
                    ) : null}
                    {overdueUi ? (
                      <div
                        className={`absolute flex items-center gap-1 rounded-full bg-rose-600 px-2 py-0.5 text-[10px] font-black uppercase text-white shadow-md ${
                          urgentOpen ? "end-3 top-12" : "end-3 top-3"
                        }`}
                      >
                        <AlertTriangle className="h-3 w-3" aria-hidden />
                        באיחור
                      </div>
                    ) : null}
                    <div className="flex items-start gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-luxury-navy-rich/10 text-luxury-navy-rich">
                        <Users className="h-5 w-5" aria-hidden />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-black uppercase tracking-wide text-slate-500">משימה קבוצתית</p>
                        <p className="mt-0.5 text-base font-black leading-snug text-luxury-navy-rich">{head.title}</p>
                        <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-black text-slate-800">
                          👥 {members.length} עובדים
                        </p>
                      </div>
                    </div>
                    <p className="mt-3 line-clamp-3 text-sm leading-snug text-slate-600">{head.description}</p>
                    <p className="mt-2 text-xs font-semibold text-slate-600">
                      <Clock3 className="me-1 inline h-3.5 w-3.5 text-luxury-navy-rich" aria-hidden />
                      שעות מתוכננות:{" "}
                      <span className="font-black text-slate-900">{scheduledLabel(head)}</span>
                    </p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {members.map((m) => (
                        <span
                          key={m.id}
                          className="inline-flex max-w-full items-center gap-1 truncate rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-bold text-slate-800"
                          title={`${m.employee.name} — ${STATUS_LABELS[m.effective_status as TaskEffectiveStatus]}`}
                        >
                          {m.employee.name} — {STATUS_LABELS[m.effective_status as TaskEffectiveStatus]}
                        </span>
                      ))}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-black ${pr}`}>
                        <Sparkles className="h-3 w-3" aria-hidden />
                        {priorityLabel(head.priority)}
                      </span>
                    </div>
                    <div className="mt-auto flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                      <button
                        type="button"
                        onClick={() => setGroupModalId(gid)}
                        className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-luxury-navy-rich px-3 py-2 text-xs font-black text-white hover:bg-luxury-charcoal"
                      >
                        פרטי עובדים
                      </button>
                    </div>
                  </article>
                );
              })}
              {soloTasks.map((task) => {
                void timeTick;
                const eff = task.effective_status as TaskEffectiveStatus;
                const overdueUi = task.deadline_passed || eff === "overdue";
                const urgentOpen = task.priority === "urgent" && task.status !== "completed";
                const pr = PRIORITY_STYLES[task.priority] ?? PRIORITY_STYLES.normal;
                const remainLine = formatRemainOrLateTask(task);

            return (
                  <article key={task.id} className={cardShell(eff, urgentOpen)}>
                    {urgentOpen ? (
                      <div className="absolute end-3 top-3 flex items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-black uppercase text-white shadow-md shadow-red-500/30">
                        <Flame className="h-3 w-3" aria-hidden />
                        דחופה
                      </div>
                    ) : null}
                    {overdueUi && task.status !== "completed" ? (
                      <div
                        className={`absolute flex items-center gap-1 rounded-full bg-rose-600 px-2 py-0.5 text-[10px] font-black uppercase text-white shadow-md ${
                          urgentOpen ? "end-3 top-12" : "end-3 top-3"
                        }`}
                      >
                        <AlertTriangle className="h-3 w-3" aria-hidden />
                        באיחור
                      </div>
                    ) : null}
                    <div
                      className={`flex items-start justify-between gap-2 ${
                        overdueUi || urgentOpen ? "pe-20 pt-1" : ""
                      }`}
                    >
                      <div className="flex min-w-0 items-start gap-3">
                        <span
                          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-gradient-to-br from-luxury-navy-rich/10 to-slate-100 text-xs font-black text-luxury-navy-rich`}
                          aria-hidden
                        >
                          {employeeInitials(task.employee.name)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-black text-slate-950">👤 {task.employee.name}</p>
                          {task.employee.department ? (
                            <p className="truncate text-xs font-bold text-slate-500">{task.employee.department}</p>
                          ) : null}
                          <p className="mt-1 text-base font-black leading-snug text-luxury-navy-rich">{task.title}</p>
                        </div>
                      </div>
                    </div>
                    <p className="mt-3 line-clamp-3 text-sm leading-snug text-slate-600">{task.description}</p>

                    <div className="mt-3 space-y-2 text-xs font-semibold text-slate-600">
                      <p className="flex items-center gap-1.5">
                        <Clock3 className="h-3.5 w-3.5 shrink-0 text-luxury-navy-rich" aria-hidden />
                        שעות מתוכננות:{" "}
                        <span className="font-black text-slate-900">{scheduledLabel(task)}</span>
                      </p>
                      {task.status !== "completed" ? (
                        <p className={remainLine.overdue ? "font-black text-rose-700" : "text-slate-600"}>
                          מצב זמן: <span className="tabular-nums">{remainLine.text}</span>
                        </p>
                      ) : (
                        <p className="text-emerald-800">
                          זמן עבודה בפועל:{" "}
                          <span className="font-black">{formatDuration(task.handling_duration_ms)}</span>
                        </p>
                      )}
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-black ${pr}`}>
                        <Sparkles className="h-3 w-3" aria-hidden />
                        {priorityLabel(task.priority)}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-black ${
                          eff === "completed"
                            ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                            : eff === "in_progress"
                              ? "border-blue-300 bg-blue-50 text-blue-900"
                              : eff === "overdue"
                                ? "border-rose-300 bg-rose-50 text-rose-900"
                                : "border-slate-200 bg-slate-50 text-slate-800"
                        }`}
                      >
                        📌 {STATUS_LABELS[eff]}
                      </span>
                      {task.status === "completed" && task.completion_quality ? (
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-black ${
                            task.completion_quality === "on_time"
                              ? "bg-emerald-100 text-emerald-900"
                              : "bg-amber-100 text-amber-950"
                          }`}
                        >
                          <Check className="h-3 w-3" aria-hidden />
                          {task.completion_quality === "on_time" ? "התחלה בזמן" : "התחלה באיחור"}
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-auto flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                      <button
                        type="button"
                        onClick={() => setEditingId((id) => (id === task.id ? null : task.id))}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden />
                        עריכה
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteTask(task.id)}
                        className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        מחיקה
                      </button>
                    </div>

                    {editingId === task.id ? (
                      <div className="mt-4 rounded-xl border border-luxury-gold/30 bg-amber-50/50 p-3">
                        <p className="text-xs font-bold text-slate-700">עריכה מהירה</p>
                        <QuickEdit task={task} onSave={(p) => void patchTask(task.id, p)} onClose={() => setEditingId(null)} />
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full min-w-[820px] border-collapse text-right text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-black text-slate-700">
                    <th className="px-3 py-3">עובד</th>
                    <th className="px-3 py-3">כותרת</th>
                    <th className="px-3 py-3">עדיפות</th>
                    <th className="px-3 py-3">סטטוס</th>
                    <th className="px-3 py-3">תאריך</th>
                    <th className="px-3 py-3">התחלה</th>
                    <th className="px-3 py-3">סיום</th>
                    <th className="px-3 py-3">מצב זמן</th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.map((task) => {
                    void timeTick;
                    const eff = task.effective_status as TaskEffectiveStatus;
                    const remainLine = formatRemainOrLateTask(task);
                    return (
                      <tr key={task.id} className="border-b border-slate-100 hover:bg-slate-50/80">
                        <td className="px-3 py-2.5 font-bold text-slate-900">
                          {task.employee.name}
                          {task.employee.department ? (
                            <span className="mt-0.5 block text-[11px] font-semibold text-slate-500">
                              {task.employee.department}
                            </span>
                          ) : null}
                        </td>
                        <td className="max-w-[200px] px-3 py-2.5 font-semibold text-slate-900">
                          <span className="line-clamp-2">{task.title ?? "—"}</span>
                        </td>
                        <td className="px-3 py-2.5">{priorityLabel(task.priority)}</td>
                        <td className="px-3 py-2.5">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-black ${
                              eff === "completed"
                                ? "bg-emerald-100 text-emerald-900"
                                : eff === "in_progress"
                                  ? "bg-blue-100 text-blue-900"
                                  : eff === "overdue"
                                    ? "bg-rose-100 text-rose-900"
                                    : "bg-slate-100 text-slate-800"
                            }`}
                          >
                            {STATUS_LABELS[eff]}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-slate-700">{formatTaskDay(task.task_date)}</td>
                        <td className="px-3 py-2.5 text-slate-700">{task.start_time}</td>
                        <td className="px-3 py-2.5 text-slate-700">{task.end_time || "..."}</td>
                        <td
                          className={`px-3 py-2.5 text-xs font-bold tabular-nums ${
                            remainLine.overdue ? "text-rose-700" : "text-slate-700"
                          }`}
                        >
                          {remainLine.text}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {groupModalId ? (
        <div
          className="fixed inset-0 z-[130] flex items-center justify-center bg-black/50 p-4"
          onClick={() => setGroupModalId(null)}
          role="presentation"
        >
          <div
            className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-black/10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <h3 className="text-lg font-black text-slate-950">פרטי משימה קבוצתית</h3>
              <button
                type="button"
                className="rounded-lg px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100"
                onClick={() => setGroupModalId(null)}
              >
                סגירה
              </button>
            </div>
            <ul className="mt-4 space-y-4">
              {tasks
                .filter((t) => t.group_id === groupModalId)
                .map((task) => {
                  const eff = task.effective_status as TaskEffectiveStatus;
                  return (
                    <li key={task.id} className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-black text-slate-950">{task.employee.name}</p>
                          <p className="text-xs text-slate-600">{scheduledLabel(task)}</p>
                          <span
                            className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[11px] font-black ${
                              eff === "completed"
                                ? "bg-emerald-100 text-emerald-900"
                                : eff === "in_progress"
                                  ? "bg-blue-100 text-blue-900"
                                  : eff === "overdue"
                                    ? "bg-rose-100 text-rose-900"
                                    : "bg-slate-100 text-slate-800"
                            }`}
                          >
                            {STATUS_LABELS[eff]}
                          </span>
                        </div>
                        <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                            onClick={() =>
                              setEditingId((id) => (id === task.id ? null : task.id))
                            }
                            className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-bold text-slate-700 hover:bg-white"
                    >
                      עריכה
                    </button>
                  <button
                    type="button"
                            onClick={() => void deleteTask(task.id)}
                            className="rounded-lg border border-rose-200 px-2 py-1 text-[11px] font-bold text-rose-700 hover:bg-rose-50"
                  >
                    מחיקה
                  </button>
                </div>
              </div>
                      {editingId === task.id ? (
                        <div className="mt-3 rounded-lg border border-luxury-gold/30 bg-white p-3">
                          <QuickEdit
                            task={task}
                            onSave={(p) => void patchTask(task.id, p)}
                            onClose={() => setEditingId(null)}
                          />
                        </div>
                      ) : null}
                    </li>
            );
          })}
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SendMini() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0">
      <path
        d="M22 2L11 13"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M22 2L15 22L11 13L2 9L22 2Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function QuickEdit({
  task,
  onSave,
  onClose,
}: {
  task: TaskRow;
  onSave: (patch: Record<string, unknown>) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(task.title ?? "");
  const [desc, setDesc] = useState(task.description);
  const [taskDateEdit, setTaskDateEdit] = useState(() => formatDateInputLocal(task.task_date));
  const [startTimeEdit, setStartTimeEdit] = useState(task.start_time);
  const [endTimeEdit, setEndTimeEdit] = useState(task.end_time ?? "");
  const [dueEdit, setDueEdit] = useState(task.due_date ?? "");
  const [empNote, setEmpNote] = useState(task.employee_note ?? "");
  const [pri, setPri] = useState(task.priority);
  const [stat, setStat] = useState(task.status);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="mt-2 space-y-2">
      <label className="block text-[11px] font-bold text-slate-600">כותרת</label>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm font-semibold"
      />
      <textarea
        value={desc}
        onChange={(e) => setDesc(e.target.value)}
        className="w-full rounded-lg border border-slate-200 bg-white p-2 text-sm font-semibold"
        rows={3}
      />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <input
          type="date"
          value={taskDateEdit}
          onChange={(e) => setTaskDateEdit(e.target.value)}
          className="rounded-lg border border-slate-200 px-2 py-2 text-sm"
        />
        <label className="text-[11px] font-bold text-slate-600">
          שעת התחלה
          <input
            type="time"
            value={startTimeEdit}
            onChange={(e) => setStartTimeEdit(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
          />
        </label>
        <label className="text-[11px] font-bold text-slate-600">
          שעת סיום
          <input
            type="time"
            value={endTimeEdit}
            onChange={(e) => setEndTimeEdit(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
          />
        </label>
      </div>
      {error ? <p className="text-xs font-bold text-rose-700">{error}</p> : null}
      <label className="block text-[11px] font-bold text-slate-600">יעד (אופציונלי)</label>
      <input
        type="date"
        value={dueEdit}
        onChange={(e) => setDueEdit(e.target.value)}
        className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
      />
      <label className="block text-[11px] font-bold text-slate-600">הערת עובד</label>
      <textarea
        value={empNote}
        onChange={(e) => setEmpNote(e.target.value)}
        rows={2}
        className="w-full rounded-lg border border-slate-200 bg-white p-2 text-sm font-semibold"
      />
      <div className="flex flex-wrap gap-2">
        <select value={pri} onChange={(e) => setPri(e.target.value)} className="rounded-lg border px-2 py-1 text-xs font-bold">
          {MANAGER_TASK_PRIORITIES.map((k) => (
            <option key={k} value={k}>
              {PRIORITY_LABELS[k]}
            </option>
          ))}
          {!MANAGER_TASK_PRIORITIES.includes(pri as (typeof MANAGER_TASK_PRIORITIES)[number]) ? (
            <option value={pri}>{priorityLabel(pri)} (ישן)</option>
          ) : null}
        </select>
        <select value={stat} onChange={(e) => setStat(e.target.value)} className="rounded-lg border px-2 py-1 text-xs font-bold">
          <option value="pending">ממתינה</option>
          <option value="in_progress">בטיפול</option>
          <option value="completed">הושלמה</option>
          <option value="problem">בעיה</option>
          <option value="rejected">נדחתה</option>
        </select>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          className="rounded-lg bg-luxury-navy-rich px-3 py-1.5 text-xs font-black text-white"
          onClick={() => {
            setError(null);
            if (!title.trim() || !taskDateEdit.trim() || !startTimeEdit.trim()) {
              setError("חובה למלא כותרת, תאריך ושעת התחלה.");
              return;
            }
            if (endTimeEdit.trim() && endTimeEdit.trim() < startTimeEdit.trim()) {
              setError("שעת סיום חייבת להיות אחרי שעת ההתחלה.");
              return;
            }
            onSave({
              title: title.trim(),
              description: desc,
              taskDate: taskDateEdit.trim(),
              startTime: startTimeEdit.trim(),
              endTime: endTimeEdit.trim() || null,
              dueDate: dueEdit.trim() || null,
              employeeNote: empNote.trim() || null,
              priority: pri,
              status: stat,
              mark_complete: stat === "completed",
            });
            onClose();
          }}
        >
          שמירה
        </button>
        <button type="button" className="rounded-lg border px-3 py-1.5 text-xs font-bold" onClick={onClose}>
          סגירה
        </button>
      </div>
    </div>
  );
}
