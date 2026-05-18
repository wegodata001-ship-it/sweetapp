"use client";

import {
  AlertCircle,
  AlertTriangle,
  Banknote,
  Calendar,
  CalendarClock,
  CheckCircle2,
  Filter,
  Landmark,
  Loader2,
  RefreshCw,
  Search,
  Trash2,
  TrendingUp,
  Undo2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { CHECK_STATUSES, type CheckStatus } from "@/lib/checks/types";
import {
  translateCheckDisplayStatus,
  translateCheckStatus,
} from "@/lib/i18n/status-keys";

type CheckDisplayStatus =
  | "UPCOMING"
  | "DUE_SOON"
  | "DUE_TODAY"
  | "LATE"
  | "DEPOSITED"
  | "CLEARED"
  | "RETURNED"
  | "CANCELLED";

type CheckRow = {
  id: string;
  customer_id: string;
  customer: { id: string; name: string; phone: string | null } | null;
  payment_id: string | null;
  document_id: string | null;
  document: { id: string; title: string | null } | null;
  check_number: string;
  bank_name: string;
  branch: string | null;
  amount: number;
  due_date: string;
  status: CheckStatus;
  effective_status: CheckStatus;
  display_status?: CheckDisplayStatus;
  tier: "neutral" | "green" | "yellow" | "orange" | "red";
  days_until_due: number;
  is_overdue: boolean;
  pending_clearance?: boolean;
  bounce_reason: string | null;
  notes: string | null;
  deposited_at: string | null;
  cleared_at: string | null;
  bounced_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
};

type Stats = {
  open_count: number;
  overdue: { count: number; amount: number };
  due_this_week: { count: number; amount: number };
  due_today: { count: number; amount: number };
  bounced: { count: number; amount: number };
  future: { count: number; amount: number };
  by_bank: Array<{ bank: string; count: number; amount: number }>;
  upcoming: Array<{
    id: string;
    check_number: string;
    amount: number;
    due_date: string;
    status: string;
    customer: { id: string; name: string } | null;
  }>;
};

type Filters = {
  q: string;
  status: string;
  bankName: string;
  dueFrom: string;
  dueTo: string;
  minAmount: string;
  maxAmount: string;
  onlyOverdue: boolean;
};

const EMPTY_FILTERS: Filters = {
  q: "",
  status: "",
  bankName: "",
  dueFrom: "",
  dueTo: "",
  minAmount: "",
  maxAmount: "",
  onlyOverdue: false,
};

const tierClasses: Record<CheckRow["tier"], string> = {
  green: "bg-emerald-100 text-emerald-900 ring-emerald-200",
  yellow: "bg-yellow-100 text-yellow-900 ring-yellow-200",
  orange: "bg-orange-100 text-orange-900 ring-orange-300",
  red: "bg-rose-100 text-rose-900 ring-rose-300",
  neutral: "bg-slate-100 text-slate-700 ring-slate-200",
};

const tierRowClasses: Record<CheckRow["tier"], string> = {
  green: "border-l-4 border-l-emerald-400",
  yellow: "border-l-4 border-l-yellow-400",
  orange: "border-l-4 border-l-orange-400",
  red: "border-l-4 border-l-rose-500",
  neutral: "border-l-4 border-l-slate-300",
};

function shekel(n: number, bcp47: string): string {
  return n.toLocaleString(bcp47, { style: "currency", currency: "ILS", maximumFractionDigits: 0 });
}

function fmtDate(s: string | null, bcp47: string): string {
  if (!s) return "—";
  const d = new Date(s);
  if (!Number.isFinite(d.getTime())) return s;
  return d.toLocaleDateString(bcp47);
}

function daysLabel(
  days: number,
  status: CheckStatus,
  tt: (k: string, vars?: Record<string, string | number>) => string,
): string {
  if (status === "CLEARED") return tt("statuses.check.CLEARED");
  if (status === "CANCELLED") return tt("statuses.check.CANCELLED");
  if (status === "BOUNCED") return tt("statuses.check.BOUNCED");
  if (days === 0) return tt("checks.today");
  if (days < 0) return tt("checks.overdueLabel", { days: Math.abs(days) });
  if (days === 1) return tt("checks.tomorrow");
  return tt("checks.inDays", { days });
}

export default function ChecksPage() {
  const { t, dir, bcp47 } = useI18n();
  const [rows, setRows] = useState<CheckRow[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [bounceTarget, setBounceTarget] = useState<CheckRow | null>(null);
  const [bounceReason, setBounceReason] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const buildQuery = useCallback((f: Filters): string => {
    const p = new URLSearchParams();
    if (f.q) p.set("q", f.q);
    if (f.status) p.set("status", f.status);
    if (f.bankName) p.set("bankName", f.bankName);
    if (f.dueFrom) p.set("dueFrom", f.dueFrom);
    if (f.dueTo) p.set("dueTo", f.dueTo);
    if (f.minAmount) p.set("minAmount", f.minAmount);
    if (f.maxAmount) p.set("maxAmount", f.maxAmount);
    if (f.onlyOverdue) p.set("onlyOverdue", "1");
    return p.toString();
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = buildQuery(filters);
      const [listRes, statsRes] = await Promise.all([
        fetch(`/api/checks${qs ? `?${qs}` : ""}`, { credentials: "same-origin" }),
        fetch("/api/checks/stats", { credentials: "same-origin" }),
      ]);
      const listJson = (await listRes.json()) as { ok: boolean; data?: CheckRow[]; error?: string };
      const statsJson = (await statsRes.json()) as { ok: boolean; data?: Stats; error?: string };
      if (!listJson.ok || !statsJson.ok) {
        setError(listJson.error ?? statsJson.error ?? t("common.errorGeneric"));
        return;
      }
      setRows(listJson.data ?? []);
      setStats(statsJson.data ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.errorGeneric"));
    } finally {
      setLoading(false);
    }
  }, [filters, buildQuery, t]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const runSweep = useCallback(async () => {
    setActionMessage(null);
    try {
      const res = await fetch("/api/checks/run-notifications", {
        method: "POST",
        credentials: "same-origin",
      });
      const json = (await res.json()) as { ok: boolean; data?: { scanned: number; alertsSent: number }; error?: string };
      if (!json.ok) {
        setActionMessage({ kind: "err", text: json.error ?? t("checks.sweepFailed") });
        return;
      }
      setActionMessage({
        kind: "ok",
        text: t("checks.sweepDone", {
          scanned: json.data?.scanned ?? 0,
          alerts: json.data?.alertsSent ?? 0,
        }),
      });
    } catch (e) {
      setActionMessage({ kind: "err", text: e instanceof Error ? e.message : t("common.errorGeneric") });
    }
  }, [t]);

  const runBackfill = useCallback(async () => {
    setActionMessage(null);
    try {
      const res = await fetch("/api/checks/backfill", {
        method: "POST",
        credentials: "same-origin",
      });
      const json = (await res.json()) as {
        ok: boolean;
        scanned?: number;
        candidatesWithChecks?: number;
        synced?: number;
        totalChecks?: number;
        errors?: string[];
        error?: string;
      };
      if (!json.ok) {
        setActionMessage({ kind: "err", text: json.error ?? t("checks.backfillFailed") });
        return;
      }
      setActionMessage({
        kind: "ok",
        text: t("checks.backfillDone", {
          scanned: json.scanned ?? 0,
          synced: json.synced ?? 0,
          total: json.totalChecks ?? 0,
        }),
      });
      await loadAll();
    } catch (e) {
      setActionMessage({ kind: "err", text: e instanceof Error ? e.message : t("common.errorGeneric") });
    }
  }, [loadAll, t]);

  const doAction = useCallback(
    async (id: string, action: "deposit" | "clear" | "cancel" | "bounce", body?: unknown) => {
      setBusyId(id);
      setActionMessage(null);
      try {
        const res = await fetch(`/api/checks/${id}/${action}`, {
          method: "POST",
          headers: body ? { "Content-Type": "application/json" } : undefined,
          body: body ? JSON.stringify(body) : undefined,
          credentials: "same-origin",
        });
        const json = (await res.json()) as { ok?: boolean; error?: string; data?: CheckRow };
        if (!json.ok) {
          setActionMessage({ kind: "err", text: json.error ?? t("common.errorGeneric") });
          return false;
        }
        await loadAll();
        return true;
      } catch (e) {
        setActionMessage({ kind: "err", text: e instanceof Error ? e.message : t("common.errorGeneric") });
        return false;
      } finally {
        setBusyId(null);
      }
    },
    [loadAll, t],
  );

  const doDelete = useCallback(
    async (id: string) => {
      if (!confirm(t("checks.confirmDelete"))) return;
      setBusyId(id);
      try {
        const res = await fetch(`/api/checks/${id}`, { method: "DELETE", credentials: "same-origin" });
        const json = (await res.json()) as { ok?: boolean; error?: string };
        if (!json.ok) {
          setActionMessage({ kind: "err", text: json.error ?? t("common.errorGeneric") });
          return;
        }
        await loadAll();
      } finally {
        setBusyId(null);
      }
    },
    [loadAll, t],
  );

  const submitBounce = useCallback(async () => {
    if (!bounceTarget) return;
    if (!bounceReason.trim()) return;
    const ok = await doAction(bounceTarget.id, "bounce", { bounceReason: bounceReason.trim() });
    if (ok) {
      setBounceTarget(null);
      setBounceReason("");
    }
  }, [bounceTarget, bounceReason, doAction]);

  const totalAmount = useMemo(() => rows.reduce((s, r) => s + r.amount, 0), [rows]);
  const hasActiveFilters = useMemo(
    () => Object.entries(filters).some(([k, v]) => v && k !== "q" && (k !== "onlyOverdue" || v === true)),
    [filters],
  );

  return (
    <main dir={dir} className="mx-auto w-full max-w-7xl px-3 pb-24 pt-3 sm:px-5 sm:pt-6">
      <header className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black text-slate-900">
            <Banknote className="h-6 w-6 text-emerald-600" />
            {t("checks.title")}
          </h1>
          <p className="text-sm text-slate-500">{t("checks.subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void runSweep()}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className="h-4 w-4" />
            {t("checks.runSweep")}
          </button>
          <button
            type="button"
            onClick={() => void runBackfill()}
            className="inline-flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-900 hover:bg-amber-100"
            title={t("checks.backfillHint")}
          >
            <RefreshCw className="h-4 w-4" />
            {t("checks.backfill")}
          </button>
          <button
            type="button"
            onClick={() => void loadAll()}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className="h-4 w-4" /> {t("checks.refresh")}
          </button>
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 lg:hidden"
          >
            <Filter className="h-4 w-4" /> {t("checks.filter")}
          </button>
        </div>
      </header>

      {actionMessage && (
        <div
          className={`mb-3 rounded-xl border px-3 py-2 text-sm font-bold ${
            actionMessage.kind === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-rose-200 bg-rose-50 text-rose-900"
          }`}
          role="status"
        >
          {actionMessage.text}
        </div>
      )}

      {/* Dashboard */}
      <section className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard icon={<CalendarClock className="h-5 w-5" />} title={t("checks.stat.open")} value={stats?.open_count ?? 0} tone="indigo" />
        <StatCard
          icon={<AlertTriangle className="h-5 w-5" />}
          title={t("checks.stat.overdue")}
          value={stats?.overdue.count ?? 0}
          sub={stats ? shekel(stats.overdue.amount, bcp47) : ""}
          tone="rose"
        />
        <StatCard
          icon={<Calendar className="h-5 w-5" />}
          title={t("checks.stat.thisWeek")}
          value={stats?.due_this_week.count ?? 0}
          sub={stats ? shekel(stats.due_this_week.amount, bcp47) : ""}
          tone="amber"
        />
        <StatCard
          icon={<Undo2 className="h-5 w-5" />}
          title={t("checks.stat.bounced")}
          value={stats?.bounced.count ?? 0}
          sub={stats ? shekel(stats.bounced.amount, bcp47) : ""}
          tone="red"
        />
        <StatCard
          icon={<TrendingUp className="h-5 w-5" />}
          title={t("checks.stat.future")}
          value={stats?.future.count ?? 0}
          sub={stats ? shekel(stats.future.amount, bcp47) : ""}
          tone="emerald"
        />
      </section>

      {/* Filter bar */}
      <section
        className={`mb-4 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm lg:block ${
          showFilters ? "block" : "hidden"
        }`}
      >
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-7">
          <label className="sm:col-span-2">
            <span className="mb-1 block text-xs font-bold text-slate-600">{t("checks.filterSearch")}</span>
            <span className="relative block">
              <Search className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={filters.q}
                onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
                placeholder={t("checks.filterSearchPlaceholder")}
                className="block w-full rounded-xl border border-slate-300 px-3 py-2 pr-7 text-sm shadow-sm"
              />
            </span>
          </label>
          <label>
            <span className="mb-1 block text-xs font-bold text-slate-600">{t("checks.filterStatus")}</span>
            <select
              value={filters.status}
              onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
              className="block w-full rounded-xl border border-slate-300 px-3 py-2 text-sm shadow-sm"
            >
              <option value="">{t("common.all")}</option>
              {CHECK_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {translateCheckStatus(t, s)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="mb-1 block text-xs font-bold text-slate-600">{t("checks.filterBank")}</span>
            <input
              value={filters.bankName}
              onChange={(e) => setFilters((f) => ({ ...f, bankName: e.target.value }))}
              className="block w-full rounded-xl border border-slate-300 px-3 py-2 text-sm shadow-sm"
            />
          </label>
          <label>
            <span className="mb-1 block text-xs font-bold text-slate-600">{t("checks.filterDueFrom")}</span>
            <input
              type="date"
              value={filters.dueFrom}
              onChange={(e) => setFilters((f) => ({ ...f, dueFrom: e.target.value }))}
              className="block w-full rounded-xl border border-slate-300 px-3 py-2 text-sm shadow-sm"
            />
          </label>
          <label>
            <span className="mb-1 block text-xs font-bold text-slate-600">{t("checks.filterDueTo")}</span>
            <input
              type="date"
              value={filters.dueTo}
              onChange={(e) => setFilters((f) => ({ ...f, dueTo: e.target.value }))}
              className="block w-full rounded-xl border border-slate-300 px-3 py-2 text-sm shadow-sm"
            />
          </label>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setFilters((f) => ({ ...f, onlyOverdue: !f.onlyOverdue }))}
            className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold ring-1 ${
              filters.onlyOverdue
                ? "bg-rose-100 text-rose-900 ring-rose-300"
                : "bg-white text-slate-700 ring-slate-300"
            }`}
          >
            <AlertTriangle className="h-3.5 w-3.5" /> {t("checks.onlyOverdue")}
          </button>
          {stats?.by_bank.slice(0, 4).map((b) => (
            <button
              key={b.bank}
              type="button"
              onClick={() => setFilters((f) => ({ ...f, bankName: f.bankName === b.bank ? "" : b.bank }))}
              className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold ring-1 ${
                filters.bankName === b.bank
                  ? "bg-indigo-100 text-indigo-900 ring-indigo-300"
                  : "bg-white text-slate-700 ring-slate-300"
              }`}
            >
              <Landmark className="h-3.5 w-3.5" /> {b.bank} ({b.count})
            </button>
          ))}
          {(hasActiveFilters || filters.q) && (
            <button
              type="button"
              onClick={() => setFilters(EMPTY_FILTERS)}
              className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700 ring-1 ring-slate-300 hover:bg-slate-200"
            >
              <X className="h-3.5 w-3.5" /> {t("checks.clear")}
            </button>
          )}
        </div>
      </section>

      {/* Summary */}
      <div className="mb-2 flex items-center justify-between text-xs font-bold text-slate-500">
        <span>
          {loading
            ? t("common.loading")
            : t("checks.results", { count: rows.length, amount: shekel(totalAmount, bcp47) })}
        </span>
        {error && (
          <span className="inline-flex items-center gap-1 text-rose-700">
            <AlertCircle className="h-3.5 w-3.5" /> {error}
          </span>
        )}
      </div>

      {/* Table — desktop */}
      <section className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:block">
        <div className="max-h-[70vh] overflow-auto">
          <table className="w-full text-right text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50 text-xs font-black uppercase text-slate-600">
              <tr>
                <th className="px-3 py-2">{t("checks.thCheck")}</th>
                <th className="px-3 py-2">{t("checks.thCustomer")}</th>
                <th className="px-3 py-2">{t("checks.thBank")}</th>
                <th className="px-3 py-2">{t("checks.thAmount")}</th>
                <th className="px-3 py-2">{t("checks.thDue")}</th>
                <th className="px-3 py-2">{t("checks.thDays")}</th>
                <th className="px-3 py-2">{t("checks.thStatus")}</th>
                <th className="px-3 py-2">{t("checks.thNotes")}</th>
                <th className="px-3 py-2 text-left">{t("checks.thActions")}</th>
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-slate-500">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                  </td>
                </tr>
              )}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-slate-500">
                    {t("checks.empty")}
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.id} className={`border-t border-slate-100 ${tierRowClasses[r.tier]} hover:bg-slate-50/60`}>
                  <td className="px-3 py-2 font-bold text-slate-900">#{r.check_number}</td>
                  <td className="px-3 py-2">
                    <div className="font-bold text-slate-900">{r.customer?.name ?? "—"}</div>
                    {r.customer?.phone && <div className="text-xs text-slate-500">{r.customer.phone}</div>}
                  </td>
                  <td className="px-3 py-2 text-slate-700">
                    {r.bank_name}
                    {r.branch ? ` · ${r.branch}` : ""}
                  </td>
                  <td className="px-3 py-2 font-bold text-slate-900">{shekel(r.amount, bcp47)}</td>
                  <td className="px-3 py-2 text-slate-700">{fmtDate(r.due_date, bcp47)}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-bold ring-1 ${tierClasses[r.tier]}`}>
                      {daysLabel(r.days_until_due, r.status, t)}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <StatusBadge
                      status={r.effective_status}
                      display={r.display_status}
                      tier={r.tier}
                    />
                    {r.document ? (
                      <div className="mt-1 text-[11px] font-semibold text-indigo-700">
                        {t("checks.linkedTo", {
                          title: r.document.title ?? r.document.id,
                        })}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 max-w-[200px] truncate text-xs text-slate-600">
                    {r.bounce_reason ? t("checks.bouncedPrefix", { reason: r.bounce_reason }) : r.notes ?? ""}
                  </td>
                  <td className="px-3 py-2 text-left">
                    <RowActions
                      row={r}
                      busy={busyId === r.id}
                      onDeposit={() => void doAction(r.id, "deposit")}
                      onClear={() => void doAction(r.id, "clear")}
                      onBounce={() => setBounceTarget(r)}
                      onCancel={() => void doAction(r.id, "cancel")}
                      onDelete={() => void doDelete(r.id)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Cards — mobile */}
      <section className="grid gap-3 lg:hidden">
        {loading && rows.length === 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-slate-500">
            <Loader2 className="mx-auto h-5 w-5 animate-spin" />
          </div>
        )}
        {!loading && rows.length === 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-slate-500">
            {t("checks.empty")}
          </div>
        )}
        {rows.map((r) => (
          <div
            key={r.id}
            className={`rounded-2xl border border-slate-200 bg-white p-3 shadow-sm ${tierRowClasses[r.tier]}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-base font-black text-slate-900">{r.customer?.name ?? "—"}</div>
                <div className="text-xs text-slate-500">
                  #{r.check_number} · {r.bank_name}
                  {r.branch ? ` · ${r.branch}` : ""}
                </div>
              </div>
              <StatusBadge
                status={r.effective_status}
                display={r.display_status}
                tier={r.tier}
              />
            </div>
            {r.document ? (
              <div className="mt-1 text-[11px] font-semibold text-indigo-700">
                {t("checks.linkedTo", { title: r.document.title ?? r.document.id })}
              </div>
            ) : null}
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              <span className="rounded-lg bg-slate-50 px-2 py-1 font-bold text-slate-900">{shekel(r.amount, bcp47)}</span>
              <span className="rounded-lg bg-slate-50 px-2 py-1 text-slate-700">{t("checks.dueLabel", { date: fmtDate(r.due_date, bcp47) })}</span>
              <span className={`rounded-lg px-2 py-1 font-bold ring-1 ${tierClasses[r.tier]}`}>
                {daysLabel(r.days_until_due, r.status, t)}
              </span>
            </div>
            {(r.bounce_reason || r.notes) && (
              <p className="mt-2 text-xs text-slate-600">{r.bounce_reason ? t("checks.bouncedPrefix", { reason: r.bounce_reason }) : r.notes}</p>
            )}
            <div className="mt-3 flex flex-wrap gap-1.5">
              <RowActions
                row={r}
                busy={busyId === r.id}
                onDeposit={() => void doAction(r.id, "deposit")}
                onClear={() => void doAction(r.id, "clear")}
                onBounce={() => setBounceTarget(r)}
                onCancel={() => void doAction(r.id, "cancel")}
                onDelete={() => void doDelete(r.id)}
                compact
              />
            </div>
          </div>
        ))}
      </section>

      {/* Bounce modal */}
      {bounceTarget && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-3 sm:items-center" role="dialog">
          <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-2xl">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-lg font-black text-slate-900">{t("checks.bounceTitle")}</h3>
              <button
                type="button"
                onClick={() => setBounceTarget(null)}
                className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"
                aria-label={t("common.close")}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mb-2 text-sm text-slate-600">
              {t("checks.bounceLine", {
                num: bounceTarget.check_number,
                customer: bounceTarget.customer?.name ?? "",
                amount: shekel(bounceTarget.amount, bcp47),
              })}
            </p>
            <div className="mb-2 grid grid-cols-2 gap-1.5">
              {(
                [
                  ["insufficient", t("checks.bounceReason.insufficient")],
                  ["wrongSignature", t("checks.bounceReason.wrongSignature")],
                  ["restricted", t("checks.bounceReason.restricted")],
                  ["cancelledByCustomer", t("checks.bounceReason.cancelledByCustomer")],
                  ["futureDate", t("checks.bounceReason.futureDate")],
                  ["damaged", t("checks.bounceReason.damaged")],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setBounceReason(label)}
                  className={`rounded-xl border px-2 py-1.5 text-xs font-bold ${
                    bounceReason === label
                      ? "border-rose-400 bg-rose-50 text-rose-900"
                      : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-bold text-slate-600">{t("checks.bounceReasonLabel")}</span>
              <textarea
                value={bounceReason}
                onChange={(e) => setBounceReason(e.target.value)}
                rows={3}
                className="block w-full rounded-xl border border-slate-300 p-2 text-sm shadow-sm focus:border-rose-400 focus:ring-rose-200"
              />
            </label>
            <div className="mt-3 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setBounceTarget(null)}
                className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                disabled={!bounceReason.trim() || busyId === bounceTarget.id}
                onClick={() => void submitBounce()}
                className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-3 py-2 text-sm font-black text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {busyId === bounceTarget.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />}
                {t("checks.bounceSubmit")}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function StatCard({
  icon,
  title,
  value,
  sub,
  tone,
}: {
  icon: React.ReactNode;
  title: string;
  value: number | string;
  sub?: string;
  tone: "indigo" | "rose" | "amber" | "red" | "emerald";
}) {
  const tones: Record<string, string> = {
    indigo: "bg-indigo-50 ring-indigo-200 text-indigo-700",
    rose: "bg-rose-50 ring-rose-200 text-rose-700",
    amber: "bg-amber-50 ring-amber-200 text-amber-800",
    red: "bg-red-50 ring-red-200 text-red-700",
    emerald: "bg-emerald-50 ring-emerald-200 text-emerald-700",
  };
  return (
    <div className={`rounded-2xl ring-1 ${tones[tone]} p-3`}>
      <div className="flex items-center gap-2 text-xs font-black uppercase">
        {icon}
        <span>{title}</span>
      </div>
      <div className="mt-1 text-2xl font-black text-slate-900">{value}</div>
      {sub && <div className="text-xs font-bold text-slate-600">{sub}</div>}
    </div>
  );
}

function StatusBadge({
  status,
  display,
  tier,
}: {
  status: CheckStatus;
  display?: CheckDisplayStatus;
  tier: CheckRow["tier"];
}) {
  const { t } = useI18n();
  const label = display
    ? translateCheckDisplayStatus(t, display)
    : translateCheckStatus(t, status);
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-black ring-1 ${tierClasses[tier]}`}
    >
      {(display === "CLEARED" || status === "CLEARED") && <CheckCircle2 className="h-3 w-3" />}
      {(display === "RETURNED" || status === "BOUNCED") && <Undo2 className="h-3 w-3" />}
      {(display === "LATE" || status === "EXPIRED") && <AlertTriangle className="h-3 w-3" />}
      {label}
    </span>
  );
}

function RowActions({
  row,
  busy,
  onDeposit,
  onClear,
  onBounce,
  onCancel,
  onDelete,
  compact,
}: {
  row: CheckRow;
  busy: boolean;
  onDeposit: () => void;
  onClear: () => void;
  onBounce: () => void;
  onCancel: () => void;
  onDelete: () => void;
  compact?: boolean;
}) {
  const { t } = useI18n();
  const base = compact
    ? "inline-flex items-center gap-1 rounded-xl px-2 py-1 text-xs font-bold ring-1"
    : "inline-flex items-center gap-1 rounded-xl px-2 py-1 text-xs font-bold ring-1";
  const canDeposit = row.status === "PENDING";
  const canClear = row.status === "PENDING" || row.status === "DEPOSITED";
  const canBounce = row.status === "PENDING" || row.status === "DEPOSITED";
  const canCancel = row.status === "PENDING" || row.status === "DEPOSITED";
  const canDelete = row.status === "PENDING" || row.status === "CANCELLED";

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {busy && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
      {canDeposit && (
        <button type="button" onClick={onDeposit} disabled={busy} className={`${base} bg-sky-50 text-sky-800 ring-sky-300 hover:bg-sky-100`}>
          {t("checks.actionDeposit")}
        </button>
      )}
      {canClear && (
        <button type="button" onClick={onClear} disabled={busy} className={`${base} bg-emerald-50 text-emerald-800 ring-emerald-300 hover:bg-emerald-100`}>
          {t("checks.actionClear")}
        </button>
      )}
      {canBounce && (
        <button type="button" onClick={onBounce} disabled={busy} className={`${base} bg-rose-50 text-rose-800 ring-rose-300 hover:bg-rose-100`}>
          {t("checks.actionBounce")}
        </button>
      )}
      {canCancel && (
        <button type="button" onClick={onCancel} disabled={busy} className={`${base} bg-slate-50 text-slate-800 ring-slate-300 hover:bg-slate-100`}>
          {t("checks.actionCancel")}
        </button>
      )}
      {canDelete && (
        <button type="button" onClick={onDelete} disabled={busy} className={`${base} bg-white text-slate-500 ring-slate-200 hover:bg-slate-50`} title={t("checks.actionDelete")}>
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
