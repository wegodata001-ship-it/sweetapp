"use client";

import { Loader2, Sparkles, Workflow } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { useI18n } from "@/components/i18n-provider";
import { useToast } from "@/components/toast-provider";
import { WorkflowRunCard } from "@/components/workflows/workflow-run-card";
import type {
  WorkflowRunDetailDto,
  WorkflowRunSummaryDto,
  WorkflowTemplateSummaryDto,
} from "@/lib/workflows/serialize";

/**
 * Worker-side workflows hub.
 *
 * Shows the active run (if any) full-width with the same `WorkflowRunCard`
 * the manager sees. If no run is active, the employee can start one from any
 * available template (assigned to themselves) — handy for "open shift"
 * style flows that the worker triggers on their own.
 */
export function EmployeeWorkflowsClient() {
  const { t, dir } = useI18n();
  const { showToast } = useToast();
  const { user } = useAuth();

  const [activeRun, setActiveRun] = useState<WorkflowRunDetailDto | null>(null);
  const [activeSummaries, setActiveSummaries] = useState<WorkflowRunSummaryDto[]>([]);
  const [templates, setTemplates] = useState<WorkflowTemplateSummaryDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<WorkflowRunSummaryDto[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [runsRes, tplsRes] = await Promise.all([
        fetch("/api/workflows/runs?status=IN_PROGRESS", { credentials: "same-origin" }),
        fetch("/api/workflows/templates", { credentials: "same-origin" }),
      ]);
      const runs = (await runsRes.json().catch(() => null)) as
        | { ok: true; data: WorkflowRunSummaryDto[] }
        | null;
      const tpls = (await tplsRes.json().catch(() => null)) as
        | { ok: true; data: WorkflowTemplateSummaryDto[] }
        | null;
      const summaries = runs?.ok ? runs.data : [];
      setActiveSummaries(summaries);
      if (summaries[0]) {
        const detailRes = await fetch(
          `/api/workflows/runs/${encodeURIComponent(summaries[0].id)}`,
          { credentials: "same-origin" },
        );
        const detail = (await detailRes.json().catch(() => null)) as
          | { ok: true; data: WorkflowRunDetailDto }
          | null;
        setActiveRun(detail?.ok ? detail.data : null);
      } else {
        setActiveRun(null);
      }
      setTemplates(tpls?.ok ? tpls.data.filter((tt) => !tt.archived_at && tt.item_count > 0) : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, [load]);

  useEffect(() => {
    // background poll once per minute to keep timers honest after sleeps
    const handle = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(handle);
  }, [load]);

  const loadHistory = useCallback(async () => {
    const res = await fetch("/api/workflows/runs?status=COMPLETED&includeCompleted=1", {
      credentials: "same-origin",
    });
    const json = (await res.json().catch(() => null)) as
      | { ok: true; data: WorkflowRunSummaryDto[] }
      | null;
    setHistory(json?.ok ? json.data : []);
  }, []);

  useEffect(() => {
    if (!historyOpen) return;
    queueMicrotask(() => {
      void loadHistory();
    });
  }, [historyOpen, loadHistory]);

  const startFromTemplate = async (templateId: string) => {
    setStarting(true);
    try {
      const myId = user?.id;
      if (!myId) {
        showToast({ tone: "error", title: t("workflows.employee.errNoSession") });
        return;
      }
      const res = await fetch("/api/workflows/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId, assigneeId: myId }),
        credentials: "same-origin",
      });
      const json = (await res.json().catch(() => null)) as
        | { ok: true; data: WorkflowRunDetailDto }
        | { ok: false; error?: string }
        | null;
      if (!json || !json.ok) {
        showToast({
          tone: "error",
          title: t("workflows.employee.errStart"),
          description: (json && !json.ok ? json.error : undefined) ?? "",
        });
        return;
      }
      showToast({
        tone: "success",
        title: t("workflows.employee.toastStarted"),
        description: json.data.title,
      });
      setActiveRun(json.data);
      void load();
    } finally {
      setStarting(false);
    }
  };

  return (
    <div dir={dir} className="mx-auto max-w-3xl space-y-4 p-3 md:p-6">
      <header className="app-panel p-4 md:p-5">
        <p className="flex items-center gap-2 text-sm font-bold tracking-wider text-violet-700">
          <Workflow className="h-4 w-4" aria-hidden />
          {t("workflows.employee.kicker")}
        </p>
        <h1 className="mt-2 text-2xl font-black text-slate-950 md:text-3xl">
          {t("workflows.employee.title")}
        </h1>
        <p className="mt-1 text-sm text-slate-600">{t("workflows.employee.subtitle")}</p>
      </header>

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" aria-hidden />
        </div>
      ) : activeRun ? (
        <WorkflowRunCard run={activeRun} canControl onChanged={() => void load()} />
      ) : (
        <section className="app-panel p-4 md:p-5">
          <h2 className="flex items-center gap-2 text-base font-black text-slate-950">
            <Sparkles className="h-4 w-4 text-violet-600" aria-hidden />
            {t("workflows.employee.noActive")}
          </h2>
          <p className="mt-1 text-xs text-slate-500">{t("workflows.employee.pickTemplate")}</p>
          {templates.length === 0 ? (
            <p className="mt-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm font-bold text-slate-500">
              {t("workflows.employee.noTemplates")}
            </p>
          ) : (
            <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {templates.map((tt) => (
                <li key={tt.id}>
                  <button
                    type="button"
                    onClick={() => void startFromTemplate(tt.id)}
                    disabled={starting}
                    className="flex w-full flex-col items-stretch gap-1 rounded-2xl border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:-translate-y-[1px] hover:border-violet-300 hover:shadow-md disabled:opacity-50"
                    style={{ borderColor: tt.color ? `${tt.color}80` : undefined }}
                  >
                    <p className="text-sm font-black text-slate-950">{tt.title}</p>
                    <p className="text-xs text-slate-500">
                      {tt.item_count} {t("workflows.employee.tasksSuffix")} · {tt.total_minutes}&apos;
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {activeSummaries.length > 1 ? (
        <section className="app-panel p-4">
          <h3 className="text-sm font-black text-slate-800">
            {t("workflows.employee.otherActive")}
          </h3>
          <ul className="mt-2 space-y-1">
            {activeSummaries.slice(1).map((r) => (
              <li
                key={r.id}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
              >
                <p className="font-black text-slate-900">{r.title}</p>
                <p className="text-slate-500">
                  {r.completed_count}/{r.item_count} · {r.total_estimated_minutes}&apos;
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <details
        className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
        onToggle={(e) => setHistoryOpen((e.target as HTMLDetailsElement).open)}
      >
        <summary className="cursor-pointer text-xs font-black text-slate-700">
          {t("workflows.employee.historyToggle")}
        </summary>
        {historyOpen ? (
          history.length === 0 ? (
            <p className="mt-3 text-xs text-slate-500">{t("workflows.employee.historyEmpty")}</p>
          ) : (
            <ul className="mt-3 space-y-1">
              {history.map((r) => (
                <li
                  key={r.id}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
                >
                  <p className="font-black text-slate-900">{r.title}</p>
                  <p className="text-slate-500">
                    {r.completed_count}/{r.item_count} ·{" "}
                    {new Date(r.completed_at ?? r.started_at).toLocaleString()}
                    {r.late_count > 0
                      ? ` · ${t("workflows.runs.summaryLate", { n: r.late_count })}`
                      : ""}
                  </p>
                </li>
              ))}
            </ul>
          )
        ) : null}
      </details>
    </div>
  );
}
