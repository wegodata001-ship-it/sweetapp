"use client";

import {
  ArrowDown,
  ArrowUp,
  Check,
  ChefHat,
  Clock,
  Flame,
  Lock,
  Plus,
  Search,
  X,
} from "lucide-react";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useI18n } from "@/components/i18n-provider";
import { useToast } from "@/components/toast-provider";
import { fireEmployeeConfetti } from "@/lib/employee-experience/confetti-burst";
import { suggestStepIcon } from "@/lib/recipes/step-icon";

function cn(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

type RecipeListItem = {
  id: string;
  title: string;
  description: string | null;
  quantityLabel: string | null;
  totalMinutes: number;
  estimatedOutput: string | null;
  isActive: boolean;
  stepCount: number;
  updatedAt: string;
};

type StepRow = {
  id: string;
  title: string;
  description: string | null;
  estimatedMinutes: number;
  orderIndex: number;
  icon: string | null;
};

type RecipeDetail = {
  id: string;
  title: string;
  description: string | null;
  quantityLabel: string | null;
  totalMinutes: number;
  estimatedOutput: string | null;
  isActive: boolean;
  steps: StepRow[];
};

type RunStepRecord = {
  id: string;
  recipeStepId: string;
  startedAt: string | null;
  completedAt: string | null;
  wasLate: boolean;
  lateReason: string | null;
  recipeStep: StepRow;
};

type RecipeRun = {
  id: string;
  recipeId: string;
  status: string;
  activeStepId: string | null;
  stepStartedAt: string | null;
  createdAt: string;
  stepRecords: RunStepRecord[];
};

type DraftStep = {
  localId: string;
  title: string;
  description: string;
  estimatedMinutes: number;
  icon: string;
};

function newLocalId() {
  return `tmp-${Math.random().toString(36).slice(2, 10)}`;
}

function useLiveTick(enabled: boolean) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => setTick((x) => x + 1), 1000);
    return () => window.clearInterval(id);
  }, [enabled]);
  return tick;
}

function formatDuration(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

function interpolate(template: string, vars: Record<string, string | number>) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k: string) =>
    String(vars[k] ?? ""),
  );
}

type StepCardProps = {
  step: StepRow;
  index: number;
  total: number;
  mode: "locked" | "available" | "active" | "completed";
  isLate: boolean;
  elapsedLabel: string;
  budgetLabel: string;
  icon: string;
  t: (k: string) => string;
  onStart: () => void;
  onComplete: () => void;
  busy: boolean;
  focusLayout?: boolean;
};

const StepCard = memo(function StepCard({
  step,
  index,
  total,
  mode,
  isLate,
  elapsedLabel,
  budgetLabel,
  icon,
  t,
  onStart,
  onComplete,
  busy,
  focusLayout,
}: StepCardProps) {
  const isActive = mode === "active";
  const isDone = mode === "completed";
  const isLocked = mode === "locked";

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border p-5 shadow-sm transition-all duration-300",
        focusLayout && "p-6 sm:p-8",
        isLocked && "border-slate-200/80 bg-slate-100/80 text-slate-500",
        isDone && "border-emerald-200 bg-emerald-50/90 text-emerald-950 shadow-md",
        isActive &&
          !isLate &&
          "border-blue-500/60 bg-blue-50/95 shadow-[0_0_24px_rgba(37,99,235,0.18)] ring-1 ring-blue-500/25",
        isActive &&
          isLate &&
          "border-red-300/90 bg-red-50/95 shadow-[0_0_20px_rgba(220,38,38,0.2)] ring-1 ring-red-400/30",
      )}
    >
      {isActive && !isLate && (
        <span
          className="pointer-events-none absolute inset-0 animate-pulse rounded-2xl bg-blue-400/5"
          aria-hidden
        />
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span className="text-2xl leading-none sm:text-3xl" aria-hidden>
            {icon}
          </span>
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {interpolate(t("recipes.stepProgress"), { current: index + 1, total })}
            </p>
            <h3 className="text-lg font-semibold text-slate-900 sm:text-xl">
              {step.title}
            </h3>
            {step.description ? (
              <p className="mt-1 text-sm text-slate-600">{step.description}</p>
            ) : null}
          </div>
        </div>
        {isLocked ? (
          <Lock className="h-5 w-5 shrink-0 text-slate-400" aria-hidden />
        ) : isDone ? (
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white shadow-md animate-in zoom-in-50 duration-300">
            <Check className="h-7 w-7" strokeWidth={2.5} />
          </div>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-4 text-sm">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/80 px-3 py-1 font-medium text-slate-700 shadow-sm ring-1 ring-slate-200/80">
          <Clock className="h-4 w-4 text-slate-500" aria-hidden />
          {budgetLabel}
        </span>
        {isActive ? (
          <span className="inline-flex items-center gap-2 rounded-full bg-white/90 px-3 py-1 font-mono text-base font-semibold tabular-nums text-blue-800 shadow-sm ring-1 ring-blue-200/80">
            <Flame className="h-4 w-4 shrink-0 text-orange-500" aria-hidden />
            {elapsedLabel}
            <span className="text-xs font-normal text-slate-500">({t("recipes.timerLive")})</span>
          </span>
        ) : null}
      </div>

      {isActive && isLate ? (
        <p className="mt-3 rounded-xl border border-red-200/80 bg-red-100/50 px-3 py-2 text-sm font-medium text-red-800">
          {t("recipes.lateBanner")}
        </p>
      ) : null}

      {!isLocked && !isDone ? (
        <div className="mt-5 flex flex-wrap gap-2">
          {isActive ? (
            <button
              type="button"
              disabled={busy}
              onClick={onComplete}
              className="inline-flex min-h-[44px] min-w-[120px] items-center justify-center rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md transition hover:bg-emerald-700 disabled:opacity-50"
            >
              {t("recipes.complete")}
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={onStart}
              className="inline-flex min-h-[44px] min-w-[120px] items-center justify-center rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md transition hover:bg-blue-700 disabled:opacity-50"
            >
              {t("recipes.start")}
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
});

export default function OpsRecipesPage() {
  const { t, dir } = useI18n();
  const { showToast } = useToast();

  const [q, setQ] = useState("");
  const [list, setList] = useState<RecipeListItem[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<RecipeDetail | null>(null);
  const [run, setRun] = useState<RecipeRun | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formQty, setFormQty] = useState("");
  const [formOutput, setFormOutput] = useState("");
  const [formSteps, setFormSteps] = useState<DraftStep[]>([]);
  const [saveBusy, setSaveBusy] = useState(false);

  const [lateModal, setLateModal] = useState<{ stepId: string } | null>(null);
  const [lateReason, setLateReason] = useState("");
  const [focusMode, setFocusMode] = useState(false);

  const runMap = useMemo(() => {
    const m = new Map<string, RunStepRecord>();
    if (!run?.stepRecords) return m;
    for (const r of run.stepRecords) m.set(r.recipeStepId, r);
    return m;
  }, [run]);

  const hasLiveTimer = useMemo(() => {
    if (!run?.activeStepId || !run.stepStartedAt) return false;
    const rec = runMap.get(run.activeStepId);
    return Boolean(rec?.startedAt && !rec.completedAt);
  }, [run, runMap]);

  const tick = useLiveTick(Boolean(hasLiveTimer));

  const loadList = useCallback(async () => {
    setListLoading(true);
    try {
      const url = new URL("/api/recipes", window.location.origin);
      if (q.trim()) url.searchParams.set("q", q.trim());
      const res = await fetch(url.toString(), { credentials: "same-origin", cache: "no-store" });
      const json = (await res.json()) as { ok?: boolean; data?: RecipeListItem[]; error?: string };
      if (!json.ok || !json.data) throw new Error(json.error ?? "err");
      setList(json.data);
    } catch {
      showToast({ tone: "error", title: t("recipes.loadFailed") });
    } finally {
      setListLoading(false);
    }
  }, [q, showToast, t]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const loadDetailAndRun = useCallback(
    async (id: string) => {
      if (!id) {
        setDetail(null);
        setRun(null);
        return;
      }
      setDetailLoading(true);
      try {
        const [dRes, rRes] = await Promise.all([
          fetch(`/api/recipes/${id}`, { credentials: "same-origin", cache: "no-store" }),
          fetch(`/api/recipes/${id}/run`, { credentials: "same-origin", cache: "no-store" }),
        ]);
        const dJson = (await dRes.json()) as { ok?: boolean; data?: RecipeDetail; error?: string };
        const rJson = (await rRes.json()) as { ok?: boolean; data?: RecipeRun | null; error?: string };
        if (!dJson.ok || !dJson.data) throw new Error(dJson.error ?? "err");
        setDetail(dJson.data);
        setRun(rJson.ok ? (rJson.data ?? null) : null);
      } catch {
        showToast({ tone: "error", title: t("recipes.loadFailed") });
        setDetail(null);
        setRun(null);
      } finally {
        setDetailLoading(false);
      }
    },
    [showToast, t],
  );

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setRun(null);
      return;
    }
    void loadDetailAndRun(selectedId);
  }, [selectedId, loadDetailAndRun]);

  const stepsSorted = detail?.steps ?? [];
  const completedCount = useMemo(() => {
    if (!run) return 0;
    return run.stepRecords.filter((x) => x.completedAt).length;
  }, [run]);

  const progressPct =
    stepsSorted.length === 0 ? 0 : Math.round((completedCount / stepsSorted.length) * 100);

  const getStepMode = useCallback(
    (step: StepRow): "locked" | "available" | "active" | "completed" => {
      const rec = runMap.get(step.id);
      if (rec?.completedAt) return "completed";
      const prevDone = stepsSorted
        .filter((s) => s.orderIndex < step.orderIndex)
        .every((s) => runMap.get(s.id)?.completedAt);
      if (!prevDone) return "locked";
      const isActiveRow =
        run?.activeStepId === step.id && Boolean(rec?.startedAt) && !rec?.completedAt;
      if (isActiveRow) return "active";
      if (!rec?.startedAt && run?.activeStepId == null) return "available";
      if (run?.activeStepId === step.id && !rec?.startedAt) return "available";
      return "locked";
    },
    [run, runMap, stepsSorted],
  );

  const isStepLate = useCallback(
    (step: StepRow) => {
      if (run?.activeStepId !== step.id || !run.stepStartedAt) return false;
      const rec = runMap.get(step.id);
      if (!rec?.startedAt || rec.completedAt) return false;
      const start = new Date(run.stepStartedAt).getTime();
      const budget = Math.max(1, step.estimatedMinutes) * 60_000;
      return Date.now() - start > budget;
    },
    [run, runMap, tick],
  );

  const displayStepNumber = useMemo(() => {
    if (!stepsSorted.length) return 0;
    const ai = stepsSorted.findIndex((s) => getStepMode(s) === "active");
    if (ai >= 0) return ai + 1;
    const vi = stepsSorted.findIndex((s) => getStepMode(s) === "available");
    if (vi >= 0) return vi + 1;
    if (completedCount >= stepsSorted.length) return stepsSorted.length;
    return Math.max(1, completedCount + 1);
  }, [stepsSorted, getStepMode, completedCount]);

  const openNewModal = () => {
    setEditingId(null);
    setFormTitle("");
    setFormDesc("");
    setFormQty("");
    setFormOutput("");
    setFormSteps([
      {
        localId: newLocalId(),
        title: "",
        description: "",
        estimatedMinutes: 5,
        icon: "",
      },
    ]);
    setModalOpen(true);
  };

  const openEditModal = async () => {
    if (!detail) return;
    setEditingId(detail.id);
    setFormTitle(detail.title);
    setFormDesc(detail.description ?? "");
    setFormQty(detail.quantityLabel ?? "");
    setFormOutput(detail.estimatedOutput ?? "");
    setFormSteps(
      detail.steps.map((s) => ({
        localId: s.id,
        title: s.title,
        description: s.description ?? "",
        estimatedMinutes: s.estimatedMinutes,
        icon: s.icon ?? "",
      })),
    );
    setModalOpen(true);
  };

  const moveStep = (idx: number, dir: -1 | 1) => {
    setFormSteps((prev) => {
      const j = idx + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      const t = next[idx]!;
      next[idx] = next[j]!;
      next[j] = t;
      return next;
    });
  };

  const addStep = () => {
    setFormSteps((prev) => [
      ...prev,
      {
        localId: newLocalId(),
        title: "",
        description: "",
        estimatedMinutes: 5,
        icon: "",
      },
    ]);
  };

  const removeStep = (idx: number) => {
    setFormSteps((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)));
  };

  const autoTotal = useMemo(
    () => formSteps.reduce((s, x) => s + Math.max(0, Math.floor(Number(x.estimatedMinutes) || 0)), 0),
    [formSteps],
  );

  const saveRecipe = async () => {
    if (!formTitle.trim()) {
      showToast({ tone: "warning", title: t("recipes.fieldTitle") });
      return;
    }
    const stepsPayload = formSteps
      .filter((s) => s.title.trim())
      .map((s) => ({
        title: s.title.trim(),
        description: s.description.trim() || null,
        estimatedMinutes: Math.max(0, Math.floor(Number(s.estimatedMinutes) || 0)),
        icon: s.icon.trim() || null,
      }));
    if (stepsPayload.length === 0) {
      showToast({ tone: "warning", title: t("recipes.stepsSection") });
      return;
    }
    setSaveBusy(true);
    try {
      if (editingId) {
        const res = await fetch(`/api/recipes/${editingId}`, {
          method: "PATCH",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: formTitle.trim(),
            description: formDesc.trim() || null,
            quantityLabel: formQty.trim() || null,
            estimatedOutput: formOutput.trim() || null,
            steps: stepsPayload,
          }),
        });
        const json = (await res.json()) as { ok?: boolean; error?: string };
        if (!json.ok) throw new Error(json.error ?? "err");
        showToast({ tone: "success", title: t("procurement.noticeSaved") });
      } else {
        const res = await fetch("/api/recipes", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: formTitle.trim(),
            description: formDesc.trim() || null,
            quantityLabel: formQty.trim() || null,
            estimatedOutput: formOutput.trim() || null,
            steps: stepsPayload,
          }),
        });
        const json = (await res.json()) as { ok?: boolean; data?: { id: string }; error?: string };
        if (!json.ok || !json.data?.id) throw new Error(json.error ?? "err");
        const newId = json.data.id;
        setSelectedId(newId);
        showToast({ tone: "success", title: t("procurement.noticeSaved") });
        setModalOpen(false);
        await loadList();
        await loadDetailAndRun(newId);
        return;
      }
      setModalOpen(false);
      await loadList();
      await loadDetailAndRun(editingId);
    } catch (e) {
      showToast({
        tone: "error",
        title: e instanceof Error ? e.message : t("recipes.loadFailed"),
      });
    } finally {
      setSaveBusy(false);
    }
  };

  const postRun = async (body: Record<string, unknown>): Promise<boolean> => {
    if (!selectedId) return false;
    setActionBusy(true);
    try {
      const res = await fetch(`/api/recipes/${selectedId}/run`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        data?: RecipeRun | null;
        error?: string;
        meta?: { wasLate?: boolean; completedRecipe?: boolean };
      };
      if (!json.ok) {
        if (json.error === "late_reason_required") {
          const sid = body.recipeStepId as string | undefined;
          if (sid) setLateModal({ stepId: sid });
          return false;
        }
        throw new Error(json.error ?? "err");
      }
      setRun(json.data ?? null);
      if (json.meta?.wasLate === false && body.action === "complete_step") {
        void fireEmployeeConfetti("task");
        showToast({
          tone: "success",
          title: t("recipes.toastOnTime"),
          description: "👏 🎉",
        });
      }
      if (json.meta?.completedRecipe) {
        showToast({ tone: "success", title: t("recipes.toastDone") });
        setFocusMode(false);
      }
      return true;
    } catch (e) {
      showToast({
        tone: "error",
        title: e instanceof Error ? e.message : t("recipes.runLoadFailed"),
      });
      return false;
    } finally {
      setActionBusy(false);
    }
  };

  const startRun = () => void postRun({ action: "start" });
  const cancelRun = () => void postRun({ action: "cancel" });
  const startStep = (recipeStepId: string) => void postRun({ action: "start_step", recipeStepId });
  const completeStep = (recipeStepId: string, lateReasonArg?: string) =>
    void postRun({
      action: "complete_step",
      recipeStepId,
      ...(lateReasonArg ? { lateReason: lateReasonArg } : {}),
    });

  const focusStep = useMemo(() => {
    if (!detail || !run) return null;
    const activeId = run.activeStepId;
    if (activeId) {
      const s = stepsSorted.find((x) => x.id === activeId);
      if (s) return s;
    }
    return (
      stepsSorted.find((s) => {
        const rec = runMap.get(s.id);
        if (rec?.completedAt) return false;
        return stepsSorted
          .filter((p) => p.orderIndex < s.orderIndex)
          .every((p) => runMap.get(p.id)?.completedAt);
      }) ?? null
    );
  }, [detail, run, stepsSorted, runMap]);

  const elapsedForStep = (step: StepRow) => {
    if (!run?.stepStartedAt || run.activeStepId !== step.id) return "00:00";
    const start = new Date(run.stepStartedAt).getTime();
    return formatDuration(Date.now() - start);
  };

  const listAside: ReactNode = (
    <aside className="w-full shrink-0 space-y-3 lg:w-[20rem]">
      <div className="relative">
        <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("recipes.searchPlaceholder")}
          className="w-full rounded-2xl border border-slate-200/90 bg-white py-2.5 ps-10 pe-3 text-sm shadow-sm outline-none ring-blue-500/20 focus:ring-2"
        />
      </div>
      <div className="max-h-[min(70vh,520px)] space-y-2 overflow-y-auto pe-1">
        {listLoading ? (
          <p className="text-sm text-slate-500">{t("recipes.loading")}</p>
        ) : list.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-6 text-center text-sm text-slate-500">
            {t("recipes.noRecipes")}
          </p>
        ) : (
          list.map((r) => {
            const selected = r.id === selectedId;
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => setSelectedId(r.id)}
                className={cn(
                  "w-full rounded-2xl border p-4 text-start shadow-sm transition",
                  selected
                    ? "border-blue-600/80 bg-slate-900 text-white shadow-[0_0_20px_rgba(37,99,235,0.35)] ring-1 ring-blue-400/40"
                    : "border-slate-200/90 bg-white hover:border-blue-300/60 hover:shadow-md",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-semibold leading-snug">{r.title}</span>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
                      selected ? "bg-blue-500 text-white" : "bg-emerald-100 text-emerald-800",
                    )}
                  >
                    {t("recipes.statusActive")}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-2 text-xs opacity-90">
                  <span>
                    {r.totalMinutes} {t("recipes.minutesShort")}
                  </span>
                  <span>·</span>
                  <span>{interpolate(t("recipes.stepsCount"), { count: r.stepCount })}</span>
                </div>
              </button>
            );
          })
        )}
      </div>
    </aside>
  );

  const workflowMain: ReactNode = (
    <main className="min-w-0 flex-1 space-y-5">
      {!selectedId ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white/70 p-10 text-center text-slate-500">
          {t("recipes.selectRecipe")}
        </div>
      ) : detailLoading || !detail ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-500">
          {t("recipes.loading")}
        </div>
      ) : (
        <>
          <header className="space-y-1">
            <h2 className="text-2xl font-bold tracking-tight text-slate-900">{detail.title}</h2>
            <div className="flex flex-wrap gap-3 text-sm text-slate-600">
              <span className="rounded-full bg-white px-3 py-1 shadow-sm ring-1 ring-slate-200/80">
                {t("recipes.totalTime")}: {detail.totalMinutes} {t("recipes.minutesShort")}
              </span>
              <span className="rounded-full bg-white px-3 py-1 shadow-sm ring-1 ring-slate-200/80">
                {interpolate(t("recipes.stepsCount"), { count: detail.steps.length })}
              </span>
              <span className="rounded-full bg-white px-3 py-1 shadow-sm ring-1 ring-slate-200/80">
                {t("recipes.shift")}: —
              </span>
              <span className="rounded-full bg-white px-3 py-1 shadow-sm ring-1 ring-slate-200/80">
                {t("recipes.startedAt")}:{" "}
                {run?.createdAt ? new Date(run.createdAt).toLocaleString() : "—"}
              </span>
            </div>
          </header>

          <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm">
            <div className="mb-2 flex items-center justify-between gap-2 text-sm font-medium text-slate-700">
              <span>
                {stepsSorted.length
                  ? interpolate(t("recipes.stepProgress"), {
                      current: displayStepNumber,
                      total: stepsSorted.length,
                    })
                  : "—"}
              </span>
              <span>{interpolate(t("recipes.percent"), { n: progressPct })}</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue-600 to-blue-400 transition-all duration-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {!run || run.status !== "active" ? (
              <button
                type="button"
                disabled={actionBusy}
                onClick={startRun}
                className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-md hover:bg-blue-700 disabled:opacity-50"
              >
                {t("recipes.startRecipe")}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  disabled={actionBusy}
                  onClick={() => setFocusMode(true)}
                  className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
                >
                  {t("recipes.focusMode")}
                </button>
                <button
                  type="button"
                  disabled={actionBusy}
                  onClick={cancelRun}
                  className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-800 hover:bg-red-100 disabled:opacity-50"
                >
                  {t("recipes.cancelRun")}
                </button>
              </>
            )}
            <button
              type="button"
              onClick={openEditModal}
              className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
            >
              {t("recipes.modalTitleEdit")}
            </button>
          </div>

          <div className="space-y-4">
            {stepsSorted.map((step, idx) => {
              const mode = getStepMode(step);
              const late = mode === "active" && isStepLate(step);
              const icon = suggestStepIcon(step.title, step.icon);
              const budgetLabel = interpolate(t("recipes.minutesLabel"), {
                n: Math.max(0, step.estimatedMinutes),
              });
              return (
                <StepCard
                  key={step.id}
                  step={step}
                  index={idx}
                  total={stepsSorted.length}
                  mode={mode}
                  isLate={late}
                  elapsedLabel={elapsedForStep(step)}
                  budgetLabel={budgetLabel}
                  icon={icon}
                  t={t}
                  busy={actionBusy}
                  onStart={() => startStep(step.id)}
                  onComplete={() => completeStep(step.id)}
                />
              );
            })}
          </div>
        </>
      )}
    </main>
  );

  return (
    <div className="min-h-screen bg-[#f8fafc] pb-16 pt-6 text-slate-900">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-600/25">
              <ChefHat className="h-7 w-7" strokeWidth={1.75} />
            </div>
            <div>
              <h1 className="text-2xl font-bold sm:text-3xl">{t("recipes.pageTitle")}</h1>
              <p className="mt-1 text-sm text-slate-600 sm:text-base">{t("recipes.pageSubtitle")}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={openNewModal}
            className="inline-flex min-h-[48px] items-center justify-center gap-2 self-start rounded-2xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-blue-600/20 hover:bg-blue-700 sm:self-auto"
          >
            <Plus className="h-5 w-5" />
            {t("recipes.newRecipe")}
          </button>
        </header>

        <div
          className={cn(
            "flex flex-col gap-6 lg:flex-row",
            dir === "ltr" && "lg:flex-row-reverse",
          )}
        >
          {listAside}
          {workflowMain}
        </div>
      </div>

      {modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4">
          <div
            role="dialog"
            className="flex max-h-[95vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl"
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h2 className="text-lg font-bold">
                {editingId ? t("recipes.modalTitleEdit") : t("recipes.modalTitleNew")}
              </h2>
              <button
                type="button"
                aria-label={t("procurement.close")}
                onClick={() => setModalOpen(false)}
                className="rounded-full p-2 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block sm:col-span-2">
                  <span className="text-xs font-semibold text-slate-600">{t("recipes.fieldTitle")}</span>
                  <input
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none ring-blue-500/20 focus:ring-2"
                  />
                </label>
                <label className="block sm:col-span-2">
                  <span className="text-xs font-semibold text-slate-600">{t("recipes.fieldDescription")}</span>
                  <textarea
                    value={formDesc}
                    onChange={(e) => setFormDesc(e.target.value)}
                    rows={2}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none ring-blue-500/20 focus:ring-2"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-slate-600">{t("recipes.fieldQuantity")}</span>
                  <input
                    value={formQty}
                    onChange={(e) => setFormQty(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none ring-blue-500/20 focus:ring-2"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-slate-600">{t("recipes.fieldOutput")}</span>
                  <input
                    value={formOutput}
                    onChange={(e) => setFormOutput(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none ring-blue-500/20 focus:ring-2"
                  />
                </label>
              </div>

              <div className="mt-6 flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-800">{t("recipes.stepsSection")}</h3>
                <span className="text-xs text-slate-500">
                  {t("recipes.totalTime")}: {autoTotal} {t("recipes.minutesShort")}
                </span>
              </div>
              <div className="mt-3 space-y-3">
                {formSteps.map((s, idx) => (
                  <div
                    key={s.localId}
                    className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 shadow-sm"
                  >
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        className="rounded-lg border border-slate-200 bg-white p-1.5 hover:bg-slate-50"
                        onClick={() => moveStep(idx, -1)}
                        aria-label={t("recipes.moveUp")}
                      >
                        <ArrowUp className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        className="rounded-lg border border-slate-200 bg-white p-1.5 hover:bg-slate-50"
                        onClick={() => moveStep(idx, 1)}
                        aria-label={t("recipes.moveDown")}
                      >
                        <ArrowDown className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        className="ms-auto text-xs text-red-600 hover:underline"
                        onClick={() => removeStep(idx)}
                      >
                        {t("recipes.removeStep")}
                      </button>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block sm:col-span-2">
                        <span className="text-xs font-semibold text-slate-600">{t("recipes.stepTitle")}</span>
                        <input
                          value={s.title}
                          onChange={(e) =>
                            setFormSteps((p) =>
                              p.map((x, i) => (i === idx ? { ...x, title: e.target.value } : x)),
                            )
                          }
                          className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                        />
                      </label>
                      <label className="block sm:col-span-2">
                        <span className="text-xs font-semibold text-slate-600">{t("recipes.stepDesc")}</span>
                        <input
                          value={s.description}
                          onChange={(e) =>
                            setFormSteps((p) =>
                              p.map((x, i) => (i === idx ? { ...x, description: e.target.value } : x)),
                            )
                          }
                          className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                        />
                      </label>
                      <label className="block">
                        <span className="text-xs font-semibold text-slate-600">{t("recipes.stepMinutes")}</span>
                        <input
                          type="number"
                          min={0}
                          value={s.estimatedMinutes}
                          onChange={(e) =>
                            setFormSteps((p) =>
                              p.map((x, i) =>
                                i === idx ? { ...x, estimatedMinutes: Number(e.target.value) } : x,
                              ),
                            )
                          }
                          className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                        />
                      </label>
                      <label className="block">
                        <span className="text-xs font-semibold text-slate-600">{t("recipes.stepIcon")}</span>
                        <input
                          value={s.icon}
                          onChange={(e) =>
                            setFormSteps((p) =>
                              p.map((x, i) => (i === idx ? { ...x, icon: e.target.value } : x)),
                            )
                          }
                          className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                          placeholder="🥣"
                        />
                      </label>
                    </div>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={addStep}
                className="mt-3 w-full rounded-xl border border-dashed border-blue-300 bg-blue-50/50 py-3 text-sm font-semibold text-blue-800 hover:bg-blue-50"
              >
                {t("recipes.addStep")}
              </button>
            </div>
            <div className="flex gap-2 border-t border-slate-100 px-5 py-4">
              <button
                type="button"
                disabled={saveBusy}
                onClick={saveRecipe}
                className="inline-flex flex-1 min-h-[48px] items-center justify-center rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {t("recipes.saveRecipe")}
              </button>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                {t("procurement.cancel")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {lateModal ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-slate-900">{t("recipes.lateReasonLabel")}</h3>
            <textarea
              value={lateReason}
              onChange={(e) => setLateReason(e.target.value)}
              placeholder={t("recipes.lateReasonPlaceholder")}
              rows={3}
              className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
                onClick={async () => {
                  if (!lateReason.trim()) return;
                  const ok = await postRun({
                    action: "complete_step",
                    recipeStepId: lateModal.stepId,
                    lateReason: lateReason.trim(),
                  });
                  if (ok) {
                    setLateModal(null);
                    setLateReason("");
                  }
                }}
              >
                {t("recipes.complete")}
              </button>
              <button
                type="button"
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm"
                onClick={() => {
                  setLateModal(null);
                  setLateReason("");
                }}
              >
                {t("procurement.close")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {focusMode && run?.status === "active" && focusStep ? (
        <div className="fixed inset-0 z-[55] flex flex-col bg-[#f8fafc]">
          <div className="flex items-center justify-between border-b border-slate-200/80 bg-white/90 px-4 py-3 backdrop-blur">
            <span className="text-sm font-semibold text-slate-800">{detail?.title}</span>
            <button
              type="button"
              onClick={() => setFocusMode(false)}
              className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              {t("recipes.exitFocus")}
            </button>
          </div>
          <div className="flex flex-1 flex-col items-center justify-center p-4">
            <div className="w-full max-w-lg">
              <StepCard
                step={focusStep}
                index={stepsSorted.findIndex((s) => s.id === focusStep.id)}
                total={stepsSorted.length}
                mode={getStepMode(focusStep)}
                isLate={getStepMode(focusStep) === "active" && isStepLate(focusStep)}
                elapsedLabel={elapsedForStep(focusStep)}
                budgetLabel={interpolate(t("recipes.minutesLabel"), {
                  n: Math.max(0, focusStep.estimatedMinutes),
                })}
                icon={suggestStepIcon(focusStep.title, focusStep.icon)}
                t={t}
                busy={actionBusy}
                focusLayout
                onStart={() => startStep(focusStep.id)}
                onComplete={() => completeStep(focusStep.id)}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
