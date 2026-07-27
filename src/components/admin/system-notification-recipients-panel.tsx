"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BellRing,
  Check,
  Loader2,
  Mail,
  Plus,
  RefreshCw,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { useToast } from "@/components/toast-provider";
import { SYSTEM_ALERT_CATEGORIES } from "@/lib/notifications/alert-categories";

type Recipient = {
  id: string;
  email: string;
  label: string;
  isActive: boolean;
  allCategories: boolean;
  categories: string[];
  notes: string | null;
  lastSentAt: string | null;
  createdAt: string;
};

type ReportRun = {
  reportDay: string;
  status: string;
  sessionCount: number;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  attempts: number;
  error: string | null;
  finishedAt: string | null;
};

const API = "/api/admin/system/notification-recipients";
const REPORT_API = "/api/admin/system/inventory-daily-report";

export function SystemNotificationRecipientsPanel() {
  const { t, dir } = useI18n();
  const { showToast } = useToast();
  const tr = useCallback(
    (key: string, vars?: Record<string, string | number>) =>
      t(`admin.system.recipients.${key}`, vars),
    [t],
  );

  const [rows, setRows] = useState<Recipient[]>([]);
  const [runs, setRuns] = useState<ReportRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [reportBusy, setReportBusy] = useState(false);

  const [draftEmail, setDraftEmail] = useState("");
  const [draftLabel, setDraftLabel] = useState("");
  const [draftAll, setDraftAll] = useState(true);
  const [draftCategories, setDraftCategories] = useState<string[]>([]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAll, setEditAll] = useState(true);
  const [editCategories, setEditCategories] = useState<string[]>([]);

  // אין עדכון state לפני ה־await הראשון, כדי שקריאה מתוך effect לא תגרום רינדור נוסף
  const load = useCallback(async () => {
    try {
      const [listRes, runsRes] = await Promise.all([
        fetch(API, { credentials: "same-origin", cache: "no-store" }),
        fetch(REPORT_API, { credentials: "same-origin", cache: "no-store" }),
      ]);
      const listJson = (await listRes.json()) as { ok?: boolean; data?: Recipient[]; error?: string };
      if (!listRes.ok || !listJson.ok) {
        setLoadError(listJson.error ?? tr("loadFailed"));
        return;
      }
      setLoadError(null);
      setRows(listJson.data ?? []);
      if (runsRes.ok) {
        const runsJson = (await runsRes.json()) as { data?: ReportRun[] };
        setRuns(runsJson.data ?? []);
      }
    } catch {
      setLoadError(tr("loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [tr]);

  const refresh = useCallback(() => {
    setLoading(true);
    void load();
  }, [load]);

  useEffect(() => {
    void load();
  }, [load]);

  const categoryLabel = useCallback(
    (key: string) => t(`admin.system.recipients.categories.${key}`),
    [t],
  );

  const activeCount = useMemo(() => rows.filter((r) => r.isActive).length, [rows]);

  async function addRecipient() {
    const email = draftEmail.trim();
    if (!email) return;
    if (!draftAll && draftCategories.length === 0) {
      showToast({ tone: "warning", title: tr("pickAtLeastOne") });
      return;
    }

    setAdding(true);
    try {
      const res = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          email,
          label: draftLabel.trim() || undefined,
          allCategories: draftAll,
          categories: draftAll ? [] : draftCategories,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; data?: Recipient; error?: string };
      if (!res.ok || !json.ok || !json.data) {
        showToast({ tone: "error", title: json.error ?? tr("saveFailed") });
        return;
      }
      setRows((prev) => [...prev, json.data!]);
      setDraftEmail("");
      setDraftLabel("");
      setDraftAll(true);
      setDraftCategories([]);
      showToast({ tone: "success", title: tr("added", { email: json.data.email }) });
    } catch {
      showToast({ tone: "error", title: tr("saveFailed") });
    } finally {
      setAdding(false);
    }
  }

  async function patchRecipient(id: string, patch: Record<string, unknown>) {
    setBusyId(id);
    try {
      const res = await fetch(`${API}/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(patch),
      });
      const json = (await res.json()) as { ok?: boolean; data?: Recipient; error?: string };
      if (!res.ok || !json.ok || !json.data) {
        showToast({ tone: "error", title: json.error ?? tr("saveFailed") });
        return false;
      }
      setRows((prev) => prev.map((r) => (r.id === id ? json.data! : r)));
      return true;
    } catch {
      showToast({ tone: "error", title: tr("saveFailed") });
      return false;
    } finally {
      setBusyId(null);
    }
  }

  async function removeRecipient(row: Recipient) {
    if (!window.confirm(tr("confirmDelete", { email: row.email }))) return;
    setBusyId(row.id);
    try {
      const res = await fetch(`${API}/${encodeURIComponent(row.id)}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        showToast({ tone: "error", title: json.error ?? tr("deleteFailed") });
        return;
      }
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      showToast({ tone: "success", title: tr("deleted", { email: row.email }) });
    } catch {
      showToast({ tone: "error", title: tr("deleteFailed") });
    } finally {
      setBusyId(null);
    }
  }

  async function sendDailyReportNow() {
    setReportBusy(true);
    try {
      const res = await fetch(REPORT_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ force: true }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        data?: { status: string; sent: number; sessionCount: number; day: string };
      };
      if (!res.ok || !json.data) {
        showToast({ tone: "error", title: json.error ?? tr("reportFailed") });
        return;
      }
      const { status, sent, sessionCount } = json.data;
      if (status === "NO_SESSIONS") {
        showToast({ tone: "info", title: tr("reportNoSessions") });
      } else if (status === "NO_RECIPIENTS") {
        showToast({ tone: "warning", title: tr("reportNoRecipients") });
      } else if (json.ok) {
        showToast({ tone: "success", title: tr("reportSent", { sent, sessions: sessionCount }) });
      } else {
        showToast({ tone: "error", title: tr("reportFailed") });
      }
      void load();
    } catch {
      showToast({ tone: "error", title: tr("reportFailed") });
    } finally {
      setReportBusy(false);
    }
  }

  function startEdit(row: Recipient) {
    setEditingId(row.id);
    setEditAll(row.allCategories);
    setEditCategories(row.categories);
  }

  async function saveEdit(id: string) {
    if (!editAll && editCategories.length === 0) {
      showToast({ tone: "warning", title: tr("pickAtLeastOne") });
      return;
    }
    const ok = await patchRecipient(id, {
      allCategories: editAll,
      categories: editAll ? [] : editCategories,
    });
    if (ok) setEditingId(null);
  }

  const lastRun = runs[0];

  return (
    <section
      dir={dir}
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-black text-slate-900">
            <BellRing className="h-5 w-5 text-indigo-600" aria-hidden />
            {tr("title")}
          </h2>
          <p className="mt-1 text-sm text-slate-600">{tr("subtitle")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} aria-hidden />
            {t("common.refresh")}
          </button>
          <button
            type="button"
            onClick={() => void sendDailyReportNow()}
            disabled={reportBusy}
            className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {reportBusy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <Send className="h-3.5 w-3.5" aria-hidden />
            )}
            {tr("sendReportNow")}
          </button>
        </div>
      </div>

      {lastRun ? (
        <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
          {tr("lastRun", {
            day: lastRun.reportDay,
            status: t(`admin.system.recipients.runStatus.${lastRun.status}`),
            sessions: lastRun.sessionCount,
            sent: lastRun.sentCount,
          })}
        </p>
      ) : null}

      {loadError ? (
        <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 ring-1 ring-rose-200">
          {loadError}
        </p>
      ) : null}

      <div className="mt-4 space-y-3">
        {loading && rows.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            {t("common.loading")}
          </p>
        ) : rows.length === 0 ? (
          <p className="rounded-xl bg-slate-50 px-3 py-3 text-sm text-slate-600">{tr("empty")}</p>
        ) : (
          rows.map((row) => {
            const busy = busyId === row.id;
            const editing = editingId === row.id;
            return (
              <div
                key={row.id}
                className={`rounded-2xl border p-3 ${
                  row.isActive ? "border-slate-200 bg-white" : "border-slate-200 bg-slate-50"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-black text-slate-900">
                      <Mail className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                      <span className="truncate" dir="ltr">
                        {row.email}
                      </span>
                    </p>
                    {row.label ? (
                      <p className="mt-0.5 text-xs font-semibold text-slate-500">{row.label}</p>
                    ) : null}
                    <p className="mt-1 text-xs text-slate-500">
                      {row.allCategories
                        ? tr("allCategories")
                        : row.categories.map(categoryLabel).join(" · ") || tr("noCategories")}
                    </p>
                    {row.lastSentAt ? (
                      <p className="mt-1 text-[11px] text-slate-400">
                        {tr("lastSent", {
                          when: new Date(row.lastSentAt).toLocaleString(),
                        })}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-bold text-slate-700">
                      <input
                        type="checkbox"
                        checked={row.isActive}
                        disabled={busy}
                        onChange={(e) =>
                          void patchRecipient(row.id, { isActive: e.target.checked })
                        }
                        className="h-4 w-4 rounded border-slate-300"
                      />
                      {row.isActive ? tr("active") : tr("inactive")}
                    </label>
                    <button
                      type="button"
                      onClick={() => (editing ? setEditingId(null) : startEdit(row))}
                      disabled={busy}
                      className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      {editing ? t("common.cancel") : tr("editTypes")}
                    </button>
                    <button
                      type="button"
                      onClick={() => void removeRecipient(row)}
                      disabled={busy}
                      aria-label={tr("delete")}
                      className="rounded-lg border border-rose-200 p-1.5 text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                    >
                      {busy ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      ) : (
                        <Trash2 className="h-4 w-4" aria-hidden />
                      )}
                    </button>
                  </div>
                </div>

                {editing ? (
                  <div className="mt-3 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
                    <label className="flex items-center gap-2 text-xs font-bold text-slate-800">
                      <input
                        type="checkbox"
                        checked={editAll}
                        onChange={(e) => setEditAll(e.target.checked)}
                        className="h-4 w-4 rounded border-slate-300"
                      />
                      {tr("allCategories")}
                    </label>
                    {!editAll ? (
                      <CategoryPicker
                        selected={editCategories}
                        onChange={setEditCategories}
                        label={categoryLabel}
                      />
                    ) : null}
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={() => void saveEdit(row.id)}
                        disabled={busy}
                        className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
                      >
                        <Check className="h-3.5 w-3.5" aria-hidden />
                        {t("common.save")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-white"
                      >
                        <X className="h-3.5 w-3.5" aria-hidden />
                        {t("common.cancel")}
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>

      <div className="mt-5 rounded-2xl border border-dashed border-slate-300 p-3">
        <p className="text-sm font-black text-slate-900">{tr("addTitle")}</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <input
            type="email"
            dir="ltr"
            value={draftEmail}
            onChange={(e) => setDraftEmail(e.target.value)}
            placeholder="name@example.com"
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
          />
          <input
            type="text"
            value={draftLabel}
            onChange={(e) => setDraftLabel(e.target.value)}
            placeholder={tr("labelPlaceholder")}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
          />
        </div>
        <label className="mt-3 flex items-center gap-2 text-xs font-bold text-slate-800">
          <input
            type="checkbox"
            checked={draftAll}
            onChange={(e) => setDraftAll(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
          {tr("allCategories")}
        </label>
        {!draftAll ? (
          <CategoryPicker
            selected={draftCategories}
            onChange={setDraftCategories}
            label={categoryLabel}
          />
        ) : null}
        <button
          type="button"
          onClick={() => void addRecipient()}
          disabled={adding || !draftEmail.trim()}
          className="mt-3 inline-flex items-center gap-1 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {adding ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Plus className="h-4 w-4" aria-hidden />
          )}
          {tr("add")}
        </button>
      </div>

      <p className="mt-3 text-xs text-slate-500">
        {tr("footerHint", { active: activeCount, total: rows.length })}
      </p>
    </section>
  );
}

function CategoryPicker({
  selected,
  onChange,
  label,
}: {
  selected: string[];
  onChange: (next: string[]) => void;
  label: (key: string) => string;
}) {
  const toggle = (key: string) => {
    onChange(selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key]);
  };

  return (
    <div className="mt-2 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
      {SYSTEM_ALERT_CATEGORIES.map((key) => (
        <label
          key={key}
          className="flex cursor-pointer items-center gap-2 rounded-lg bg-white px-2 py-1.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-200"
        >
          <input
            type="checkbox"
            checked={selected.includes(key)}
            onChange={() => toggle(key)}
            className="h-3.5 w-3.5 rounded border-slate-300"
          />
          {label(key)}
        </label>
      ))}
    </div>
  );
}
