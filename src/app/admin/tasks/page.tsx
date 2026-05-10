"use client";

import {
  AlertTriangle,
  Check,
  ChevronDown,
  ClipboardList,
  Clock3,
  Filter,
  Flame,
  LayoutGrid,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Table,
  Trash2,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MANAGER_TASK_PRIORITIES,
  PRIORITY_LABELS,
  STATUS_LABELS,
  priorityLabel,
  type TaskEffectiveStatus,
} from "@/lib/tasks/helpers";
import type { SerializedEmployeeTask } from "@/lib/tasks/serialize-task";

type Assignee = {
  id: string;
  name: string;
  role: string | null;
  department: string | null;
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

function formatDue(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleString("he-IL", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function formatClock(iso: string | null) {
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

function formatDuration(ms: number | null) {
  if (ms == null || ms < 0) return "—";
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 72) return `${Math.floor(h / 24)} ימים`;
  if (h > 0) return `${h}ש ${m}דק`;
  return `${m} דק׳`;
}

/** יחידת זמן שנותר או כמה זמן עבר מאז היעד */
function formatRemainOrLate(dueIso: string, status: string) {
  if (status === "completed") return { overdue: false as const, text: "—" };
  const dueMs = new Date(dueIso).getTime();
  const left = dueMs - Date.now();
  if (left <= 0) {
    return {
      overdue: true as const,
      text: `⚠ עבר לפני ${formatRemain(Math.abs(left))}`,
    };
  }
  return { overdue: false as const, text: formatRemain(left) };
}

function combineDueAtIso(dateStr: string, timeStr: string): string | null {
  if (!dateStr?.trim() || !timeStr?.trim()) return null;
  const combined = `${dateStr.trim()}T${timeStr.trim()}`;
  const d = new Date(combined);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

function employeeInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase() || "?";
}

function cardShell(eff: TaskEffectiveStatus, urgentGlow: boolean) {
  const base =
    "relative flex h-full min-h-[280px] flex-col rounded-2xl border bg-white p-4 shadow-sm transition";
  if (urgentGlow && eff !== "completed") {
    return `${base} border-red-500 ring-2 ring-red-400/55 shadow-[0_0_22px_rgba(239,68,68,0.28)]`;
  }
  if (eff === "overdue") return `${base} border-rose-400 ring-2 ring-rose-300/50`;
  if (eff === "completed") return `${base} border-emerald-300 bg-emerald-50/25`;
  if (eff === "in_progress") return `${base} border-blue-400 bg-blue-50/30`;
  return `${base} border-slate-200 bg-slate-50/40`;
}

export default function AdminTasksPage() {
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [assigneesError, setAssigneesError] = useState<string | null>(null);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [stats, setStats] = useState<TaskStats | null>(null);
  const [metaEmployeeId, setMetaEmployeeId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [employeeId, setEmployeeId] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("12:00");
  const [priority, setPriority] = useState<(typeof MANAGER_TASK_PRIORITIES)[number]>("normal");
  const [createSuccess, setCreateSuccess] = useState(false);
  const [timeTick, setTimeTick] = useState(0);

  const [tab, setTab] = useState<(typeof TAB_OPTIONS)[number]["id"]>("all");
  const [filterQ, setFilterQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [filterEmployee, setFilterEmployee] = useState("");
  const [filterPriority, setFilterPriority] = useState("");
  const [filterDepartment, setFilterDepartment] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");

  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(filterQ), 380);
    return () => window.clearTimeout(t);
  }, [filterQ]);

  const departmentOptions = useMemo(() => {
    const s = new Set<string>();
    for (const a of assignees) {
      if (a.department?.trim()) s.add(a.department.trim());
    }
    return [...s].sort((a, b) => a.localeCompare(b, "he"));
  }, [assignees]);

  const loadAssignees = useCallback(async () => {
    setAssigneesError(null);
    try {
      const res = await fetch("/api/tasks/assignees", { credentials: "same-origin" });
      if (!res.ok) {
        setAssignees([]);
        setAssigneesError(
          res.status === 403 ? "אין הרשאה לטעון עובדים (נדרשת הרשאת משימות)." : "טעינת עובדים נכשלה.",
        );
        return;
      }
      const j = (await res.json()) as { data?: Assignee[] };
      setAssignees(j.data ?? []);
    } catch {
      setAssignees([]);
      setAssigneesError("טעינת עובדים נכשלה.");
    }
  }, []);

  const loadTasks = useCallback(async () => {
    setLoadError(null);
    try {
      const params = new URLSearchParams();
      params.set("tab", tab);
      if (debouncedQ.trim()) params.set("q", debouncedQ.trim());
      if (filterEmployee) params.set("employeeId", filterEmployee);
      if (filterPriority) params.set("priority", filterPriority);
      if (filterDepartment) params.set("department", filterDepartment);
      if (filterDateFrom) params.set("dateFrom", filterDateFrom);
      if (filterDateTo) params.set("dateTo", filterDateTo);

      const res = await fetch(`/api/tasks?${params.toString()}`, { credentials: "same-origin" });
      if (res.status === 503) {
        setLoadError("אין חיבור למסד — הגדרו DATABASE_URL");
        return;
      }
      const j = (await res.json()) as {
        data?: TaskRow[];
        stats?: TaskStats;
        meta?: { user_employee_id?: string | null };
        ok?: boolean;
      };
      if (j.data) setTasks(j.data);
      if (j.stats) setStats(j.stats);
      if (j.meta?.user_employee_id !== undefined) {
        setMetaEmployeeId(j.meta.user_employee_id ?? null);
      }
    } catch {
      setLoadError("טעינה נכשלה");
    }
  }, [tab, debouncedQ, filterEmployee, filterPriority, filterDepartment, filterDateFrom, filterDateTo]);

  useEffect(() => {
    void loadAssignees();
  }, [loadAssignees]);

  useEffect(() => {
    void loadTasks();
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
    const dueIso = combineDueAtIso(dueDate, dueTime);
    if (!employeeId || !taskTitle.trim() || !taskDescription.trim() || !dueIso) return;
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employeeId,
        title: taskTitle.trim(),
        description: taskDescription.trim(),
        dueAt: dueIso,
        priority,
      }),
      credentials: "same-origin",
    });
    if (!res.ok) return;
    setTaskTitle("");
    setTaskDescription("");
    setDueDate("");
    setDueTime("12:00");
    setPriority("normal");
    setEmployeeId("");
    setCreateSuccess(true);
    await loadTasks();
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
        {tab === "mine" && !metaEmployeeId && (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            לא שויך עובד לחשבון המשתמש — שאלו מנהל לשייך Worker במסך משתמשים. עד אז הטאב «שלי» ריק.
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

        {assigneesError ? (
          <p className="mt-4 text-sm font-bold text-rose-700" role="alert">
            {assigneesError}
          </p>
        ) : null}

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <span className={labelClass}>
              <span className="flex items-center gap-2">
                <UserRound className="h-4 w-4 text-slate-500" aria-hidden />
                עובד
              </span>
            </span>
            {assignees.length === 0 && !assigneesError ? (
              <div className="mt-2 rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 p-6 text-center shadow-inner">
                <p className="text-sm font-black text-slate-800">אין עובדים במערכת</p>
                <p className="mt-1 text-xs text-slate-600">הוסיפו עובד בכרטסות כדי להקצות משימות.</p>
                <Link
                  href="/finance/ledgers"
                  className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl bg-luxury-navy-rich px-4 py-2.5 text-sm font-black text-white shadow-sm hover:bg-luxury-charcoal"
                >
                  <Plus className="h-4 w-4" aria-hidden />
                  צור עובד חדש
                </Link>
              </div>
            ) : (
              <div className="mt-2">
                <EmployeeAssigneePicker
                  assignees={assignees}
                  value={employeeId}
                  onChange={setEmployeeId}
                />
              </div>
            )}
          </div>

          <label className={labelClass}>
            <span className="flex items-center gap-2">
              <span aria-hidden>📅</span>
              תאריך יעד
            </span>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className={inputClass}
            />
          </label>

          <label className={labelClass}>
            <span className="flex items-center gap-2">
              <Clock3 className="h-4 w-4 text-slate-500" aria-hidden />
              שעת יעד
            </span>
            <input
              type="time"
              value={dueTime}
              onChange={(e) => setDueTime(e.target.value)}
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
            <span className={labelClass}>תיאור משימה *</span>
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
            disabled={assignees.length === 0}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-luxury-gold px-5 py-3 text-sm font-black text-luxury-charcoal shadow-luxury-sm hover:bg-luxury-gold-hover disabled:pointer-events-none disabled:opacity-50"
          >
            <SendMini />
            הקצאת משימה
          </button>
        </div>
      </section>

      {dash ? (
        <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {[
            { k: "total", label: "סה״כ משימות", value: dash.total, tone: "bg-slate-100 text-slate-900 border-slate-200" },
            { k: "in_progress", label: "בטיפול", value: dash.in_progress, tone: "bg-blue-50 text-blue-950 border-blue-200" },
            { k: "completed", label: "הושלמו", value: dash.completed, tone: "bg-emerald-50 text-emerald-950 border-emerald-200" },
            { k: "overdue", label: "באיחור", value: dash.overdue, tone: "bg-rose-50 text-rose-950 border-rose-200" },
            { k: "urgent_open", label: "דחופות פתוחות", value: dash.urgent_open, tone: "bg-orange-50 text-orange-950 border-orange-300" },
          ].map((c) => (
            <div
              key={c.k}
              className={`rounded-2xl border px-4 py-3 shadow-sm ${c.tone}`}
            >
              <p className="text-[11px] font-bold opacity-80">{c.label}</p>
              <p className="mt-1 text-2xl font-black tabular-nums">{c.value}</p>
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

        <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
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
            value={filterEmployee}
            onChange={(e) => setFilterEmployee(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900"
          >
            <option value="">כל העובדים</option>
            {assignees.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <select
            value={filterDepartment}
            onChange={(e) => setFilterDepartment(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900"
          >
            <option value="">כל המחלקות</option>
            {departmentOptions.map((d) => (
              <option key={d} value={d}>
                {d}
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
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              {tasks.map((task) => {
                void timeTick;
                const eff = task.effective_status as TaskEffectiveStatus;
                const overdueUi = eff === "overdue";
                const urgentOpen = task.priority === "urgent" && task.status !== "completed";
                const pr = PRIORITY_STYLES[task.priority] ?? PRIORITY_STYLES.normal;
                const remainLine = formatRemainOrLate(task.due_at, task.status);

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
                          <p className="mt-1 text-base font-black leading-snug text-luxury-navy-rich">
                            {task.title ?? "—"}
                          </p>
                        </div>
                      </div>
                    </div>
                    <p className="mt-3 line-clamp-3 text-sm leading-snug text-slate-600">{task.description}</p>

                    <div className="mt-3 space-y-2 text-xs font-semibold text-slate-600">
                      <p className="flex items-center gap-1.5">
                        <Clock3 className="h-3.5 w-3.5 shrink-0 text-luxury-navy-rich" aria-hidden />
                        זמן יעד: <span className="font-black text-slate-900">{formatDue(task.due_at)}</span>
                      </p>
                      {task.status !== "completed" ? (
                        <p className={remainLine.overdue ? "font-black text-rose-700" : "text-slate-600"}>
                          זמן שנותר: <span className="tabular-nums">{remainLine.text}</span>
                        </p>
                      ) : (
                        <p className="text-emerald-800">
                          זמן טיפול:{" "}
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
                          {task.completion_quality === "on_time" ? "הושלם בזמן" : "הושלם באיחור"}
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
              <table className="w-full min-w-[720px] border-collapse text-right text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-black text-slate-700">
                    <th className="px-3 py-3">עובד</th>
                    <th className="px-3 py-3">כותרת</th>
                    <th className="px-3 py-3">עדיפות</th>
                    <th className="px-3 py-3">סטטוס</th>
                    <th className="px-3 py-3">זמן יעד</th>
                    <th className="px-3 py-3">זמן שנותר</th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.map((task) => {
                    void timeTick;
                    const eff = task.effective_status as TaskEffectiveStatus;
                    const remainLine = formatRemainOrLate(task.due_at, task.status);
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
                        <td className="px-3 py-2.5 tabular-nums text-slate-700">{formatDue(task.due_at)}</td>
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
    </div>
  );
}

function splitLocalDateTime(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

function EmployeeAssigneePicker({
  assignees,
  value,
  onChange,
}: {
  assignees: Assignee[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleDoc(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleDoc);
    return () => document.removeEventListener("mousedown", handleDoc);
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return assignees;
    return assignees.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        (a.role ?? "").toLowerCase().includes(q) ||
        (a.department ?? "").toLowerCase().includes(q),
    );
  }, [assignees, search]);

  const selected = assignees.find((a) => a.id === value);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-right shadow-sm outline-none transition hover:border-luxury-gold focus:border-luxury-gold focus:ring-2 focus:ring-luxury-gold/25"
      >
        {selected ? (
          <span className="flex min-w-0 flex-1 items-center gap-3">
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-gradient-to-br from-luxury-navy-rich/12 to-slate-50 text-xs font-black text-luxury-navy-rich"
              aria-hidden
            >
              {employeeInitials(selected.name)}
            </span>
            <span className="min-w-0 flex-1 text-right">
              <span className="block truncate font-black text-slate-950">👤 {selected.name}</span>
              <span className="mt-0.5 block truncate text-xs font-semibold text-slate-500">
                {selected.department ?? "ללא מחלקה"}
              </span>
            </span>
            {selected.role ? (
              <span className="shrink-0 rounded-full border border-luxury-gold/40 bg-luxury-gold/15 px-2 py-0.5 text-[10px] font-black text-luxury-navy-rich">
                {selected.role}
              </span>
            ) : null}
          </span>
        ) : (
          <span className="text-sm font-semibold text-slate-400">בחרו עובד מהרשימה</span>
        )}
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-500 transition ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>

      {open ? (
        <div className="absolute start-0 top-[calc(100%+6px)] z-50 w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl ring-1 ring-black/5">
          <div className="border-b border-slate-100 p-2">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-900 outline-none focus:border-luxury-gold"
              placeholder="חיפוש עובד…"
              autoFocus
            />
          </div>
          <ul className="max-h-56 overflow-y-auto py-1">
            {filtered.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(a.id);
                    setOpen(false);
                    setSearch("");
                  }}
                  className={`flex w-full items-center gap-3 px-3 py-2.5 text-right transition hover:bg-luxury-navy-rich/5 ${
                    value === a.id ? "bg-luxury-gold/15" : ""
                  }`}
                >
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-[11px] font-black text-luxury-navy-rich"
                    aria-hidden
                  >
                    {employeeInitials(a.name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-black text-slate-950">{a.name}</span>
                    <span className="block truncate text-xs font-semibold text-slate-500">{a.department ?? "—"}</span>
                  </span>
                  {a.role ? (
                    <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-700">
                      {a.role}
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
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
  const [dueDate, setDueDate] = useState(() => splitLocalDateTime(task.due_at).date);
  const [dueTime, setDueTime] = useState(() => splitLocalDateTime(task.due_at).time);
  const [pri, setPri] = useState(task.priority);
  const [stat, setStat] = useState(task.status);

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
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className="rounded-lg border border-slate-200 px-2 py-2 text-sm"
        />
        <input
          type="time"
          value={dueTime}
          onChange={(e) => setDueTime(e.target.value)}
          className="rounded-lg border border-slate-200 px-2 py-2 text-sm"
        />
      </div>
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
        </select>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          className="rounded-lg bg-luxury-navy-rich px-3 py-1.5 text-xs font-black text-white"
          onClick={() => {
            const dueIso = combineDueAtIso(dueDate, dueTime);
            if (!title.trim() || !dueIso) return;
            onSave({
              title: title.trim(),
              description: desc,
              dueAt: dueIso,
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
