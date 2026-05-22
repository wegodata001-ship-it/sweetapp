"use client";

import { ClipboardList, Loader2, Plus, RefreshCw, Send } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { useToast } from "@/components/toast-provider";
import { dispatchNotificationsRefresh } from "@/lib/notifications/refresh-event";
import { TaskGroupsSection } from "@/components/tasks/task-groups-section";
import type { SerializedWorkEmployeeTask } from "@/lib/work-tasks/serialize-work-task";

type TaskTemplateRow = {
  id: string;
  title: string;
  estimatedMinutes: number;
  isActive: boolean;
};

type WorkTemplateRow = {
  id: string;
  title: string;
  tasks: { id: string; orderIndex: number; taskTemplate: TaskTemplateRow }[];
};

type EmployeeRow = { id: string; name: string };

export default function AdminWorkTasksPage() {
  const { t, dir } = useI18n();
  const { showToast } = useToast();
  const [library, setLibrary] = useState<TaskTemplateRow[]>([]);
  const [templates, setTemplates] = useState<WorkTemplateRow[]>([]);
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [live, setLive] = useState<{
    active: (SerializedWorkEmployeeTask & { employee_name?: string })[];
    pending: (SerializedWorkEmployeeTask & { employee_name?: string })[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [newLibTitle, setNewLibTitle] = useState("");
  const [newLibMin, setNewLibMin] = useState(15);
  const [newTplTitle, setNewTplTitle] = useState("");
  const [newTplItems, setNewTplItems] = useState<string[]>([]);
  const [assignTpl, setAssignTpl] = useState("");
  const [assignEmp, setAssignEmp] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [libRes, tplRes, empRes, liveRes] = await Promise.all([
        fetch("/api/admin/work-library", { credentials: "same-origin" }),
        fetch("/api/admin/work-templates", { credentials: "same-origin" }),
        fetch("/api/employees", { credentials: "same-origin" }),
        fetch("/api/admin/work-tasks/live", { credentials: "same-origin" }),
      ]);
      const libJ = (await libRes.json()) as { ok?: boolean; data?: TaskTemplateRow[] };
      const tplJ = (await tplRes.json()) as { ok?: boolean; data?: WorkTemplateRow[] };
      const empJ = (await empRes.json()) as { ok?: boolean; data?: EmployeeRow[] };
      const liveJ = (await liveRes.json()) as {
        ok?: boolean;
        data?: {
          active: (SerializedWorkEmployeeTask & { employee_name?: string })[];
          pending: (SerializedWorkEmployeeTask & { employee_name?: string })[];
        };
      };
      if (libJ.ok) setLibrary(libJ.data ?? []);
      if (tplJ.ok) setTemplates(tplJ.data ?? []);
      if (empJ.ok) setEmployees(empJ.data ?? []);
      if (liveJ.ok && liveJ.data) setLive(liveJ.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const addLibrary = async () => {
    const title = newLibTitle.trim();
    if (!title) return;
    const res = await fetch("/api/admin/work-library", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, estimatedMinutes: newLibMin }),
    });
    const j = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok || !j.ok) {
      showToast({ tone: "error", title: j.error ?? t("common.error") });
      return;
    }
    setNewLibTitle("");
    setNewLibMin(15);
    showToast({ tone: "success", title: t("common.saved") });
    void refresh();
  };

  const createWorkTemplate = async () => {
    const title = newTplTitle.trim();
    if (!title || newTplItems.length === 0) {
      showToast({ tone: "warning", title: t("admin.tasks.work.needTitleAndItems") });
      return;
    }
    const res = await fetch("/api/admin/work-templates", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        items: newTplItems.map((taskTemplateId, i) => ({ taskTemplateId, orderIndex: i })),
      }),
    });
    const j = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok || !j.ok) {
      showToast({ tone: "error", title: j.error ?? t("common.error") });
      return;
    }
    setNewTplTitle("");
    setNewTplItems([]);
    showToast({ tone: "success", title: t("common.saved") });
    void refresh();
  };

  const assign = async () => {
    if (!assignTpl || !assignEmp) {
      showToast({ tone: "warning", title: t("admin.tasks.work.pickTemplateAndEmployee") });
      return;
    }
    const res = await fetch("/api/admin/work-assign", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workTemplateId: assignTpl, employeeId: assignEmp }),
    });
    const j = (await res.json()) as {
      ok?: boolean;
      error?: string;
      data?: { count: number; notificationsSent?: number; employeeLinkedToUser?: boolean };
    };
    if (!res.ok || !j.ok) {
      showToast({ tone: "error", title: j.error ?? t("common.error") });
      return;
    }
    showToast({
      tone: "success",
      title: t("admin.tasks.work.assignedCount", { count: String(j.data?.count ?? 0) }),
    });
    if ((j.data?.notificationsSent ?? 0) > 0) {
      showToast({ tone: "info", title: t("alerts.notificationSent") });
    } else if (j.data?.employeeLinkedToUser === false) {
      showToast({ tone: "warning", title: t("admin.tasks.work.noUserLinkForNotify") });
    }
    dispatchNotificationsRefresh();
    void refresh();
  };

  const toggleItem = (id: string) => {
    setNewTplItems((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8" dir={dir}>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-sm font-black text-violet-800">
            <ClipboardList className="h-4 w-4" aria-hidden />
            {t("nav.adminTasks")}
          </p>
          <h1 className="mt-1 text-2xl font-black text-slate-950">{t("admin.tasks.work.pageTitle")}</h1>
          <p className="mt-1 text-sm text-slate-600">{t("admin.tasks.work.pageSubtitle")}</p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-800"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RefreshCw className="h-4 w-4" aria-hidden />}
          {t("common.refresh")}
        </button>
      </header>

      <TaskGroupsSection
        employees={employees.map((e) => ({
          id: e.id,
          fullName: e.name,
          email: "",
          role: "EMPLOYEE",
        }))}
        canManage
      />

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-black text-slate-900">{t("admin.tasks.work.libraryTitle")}</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            <input
              className="min-w-[12rem] flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm"
              placeholder={t("admin.tasks.work.libraryNamePh")}
              value={newLibTitle}
              onChange={(e) => setNewLibTitle(e.target.value)}
            />
            <input
              type="number"
              min={1}
              className="w-24 rounded-xl border border-slate-200 px-2 py-2 text-sm"
              value={newLibMin}
              onChange={(e) => setNewLibMin(Number(e.target.value) || 15)}
            />
            <button
              type="button"
              onClick={() => void addLibrary()}
              className="inline-flex items-center gap-1 rounded-xl bg-violet-700 px-3 py-2 text-xs font-black text-white"
            >
              <Plus className="h-4 w-4" aria-hidden />
              {t("admin.tasks.work.addToLibrary")}
            </button>
          </div>
          <ul className="mt-4 max-h-56 space-y-1 overflow-y-auto text-sm">
            {library.map((row) => (
              <li key={row.id} className="flex justify-between rounded-lg border border-slate-100 px-2 py-1">
                <span className="font-semibold text-slate-800">{row.title}</span>
                <span className="text-xs text-slate-500">{row.estimatedMinutes}′</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-black text-slate-900">{t("admin.tasks.work.templateTitle")}</h2>
          <input
            className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            placeholder={t("admin.tasks.work.templateNamePh")}
            value={newTplTitle}
            onChange={(e) => setNewTplTitle(e.target.value)}
          />
          <p className="mt-2 text-xs font-bold text-slate-500">{t("admin.tasks.work.pickLibraryItems")}</p>
          <div className="mt-2 max-h-40 space-y-1 overflow-y-auto rounded-xl border border-slate-100 p-2">
            {library.map((row) => (
              <label key={row.id} className="flex cursor-pointer items-center gap-2 text-sm">
                <input type="checkbox" checked={newTplItems.includes(row.id)} onChange={() => toggleItem(row.id)} />
                <span>{row.title}</span>
              </label>
            ))}
          </div>
          <button
            type="button"
            onClick={() => void createWorkTemplate()}
            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 py-2 text-sm font-black text-white"
          >
            {t("admin.tasks.work.saveWorkTemplate")}
          </button>
          <ul className="mt-4 space-y-1 text-xs text-slate-600">
            {templates.map((wt) => (
              <li key={wt.id}>
                <strong className="text-slate-900">{wt.title}</strong> — {wt.tasks.length}{" "}
                {t("admin.tasks.work.tasksSuffix")}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-black text-slate-900">{t("admin.tasks.work.assignTitle")}</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <select
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            value={assignTpl}
            onChange={(e) => setAssignTpl(e.target.value)}
          >
            <option value="">{t("admin.tasks.work.selectWorkTemplate")}</option>
            {templates.map((wt) => (
              <option key={wt.id} value={wt.id}>
                {wt.title}
              </option>
            ))}
          </select>
          <select
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            value={assignEmp}
            onChange={(e) => setAssignEmp(e.target.value)}
          >
            <option value="">{t("admin.tasks.work.selectEmployeeCard")}</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void assign()}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 py-2 text-sm font-black text-white"
          >
            <Send className="h-4 w-4" aria-hidden />
            {t("admin.tasks.work.assignButton")}
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-black text-slate-900">{t("admin.tasks.work.liveTitle")}</h2>
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          <div>
            <p className="text-xs font-bold text-blue-800">{t("admin.tasks.work.activeCol")}</p>
            <ul className="mt-2 space-y-1 text-sm">
              {(live?.active ?? []).map((r) => (
                <li key={r.id} className="rounded-lg border border-blue-100 bg-blue-50/50 px-2 py-1">
                  <span className="font-black">{r.employee_name}</span> — {r.title}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-xs font-bold text-amber-800">{t("admin.tasks.work.pendingCol")}</p>
            <ul className="mt-2 space-y-1 text-sm">
              {(live?.pending ?? []).map((r) => (
                <li key={r.id} className="rounded-lg border border-amber-100 bg-amber-50/40 px-2 py-1">
                  <span className="font-black">{r.employee_name}</span> — {r.title}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
