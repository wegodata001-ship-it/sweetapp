"use client";

import { Loader2, Workflow } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { WorkflowRunCard } from "@/components/workflows/workflow-run-card";
import type {
  WorkflowRunDetailDto,
  WorkflowRunSummaryDto,
} from "@/lib/workflows/serialize";

/**
 * פורטל עובד — רק workflow שהמנהל הקצה (assigneeId = המשתמש הנוכחי).
 * אין יצירה עצמית מתבניות.
 */
export function EmployeeWorkflowsClient() {
  const { t, dir } = useI18n();

  const [activeRun, setActiveRun] = useState<WorkflowRunDetailDto | null>(null);
  const [activeSummaries, setActiveSummaries] = useState<WorkflowRunSummaryDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<WorkflowRunSummaryDto[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const runsRes = await fetch(`/api/workflows/runs?status=IN_PROGRESS&_=${Date.now()}`, {
        credentials: "same-origin",
        cache: "no-store",
      });
      const runs = (await runsRes.json().catch(() => null)) as
        | { ok: true; data: WorkflowRunSummaryDto[] }
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
        <WorkflowRunCard run={activeRun} canControl employeeView onChanged={() => void load()} />
      ) : (
        <section className="app-panel p-4 md:p-5">
          <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm font-bold text-slate-600">
            {t("workflows.employee.noTemplates")}
          </p>
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
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-800"
              >
                {r.title}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="app-panel p-4">
        <button
          type="button"
          onClick={() => setHistoryOpen((v) => !v)}
          className="text-sm font-black text-violet-800 underline-offset-2 hover:underline"
        >
          {t("workflows.employee.historyToggle")}
        </button>
        {historyOpen ? (
          <ul className="mt-3 space-y-2">
            {history.length === 0 ? (
              <li className="text-sm text-slate-500">{t("workflows.employee.historyEmpty")}</li>
            ) : (
              history.map((r) => (
                <li
                  key={r.id}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800"
                >
                  {r.title}
                </li>
              ))
            )}
          </ul>
        ) : null}
      </section>
    </div>
  );
}
