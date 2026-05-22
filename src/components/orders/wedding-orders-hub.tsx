"use client";

import {
  Calendar,
  CalendarHeart,
  Eye,
  FileText,
  Gem,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import type { FutureOrderRow } from "@/components/orders/orders-hub";
import { formatShekel } from "@/lib/format-shekel";
import {
  computeRemainingAmount,
  FUTURE_ORDER_STATUSES,
  isWeddingOrderOverdue,
  ORDER_CATEGORY_WEDDING,
  type FutureOrderStatus,
  weddingStatusI18nKey,
  WEDDING_STATUS_BADGE_CLASS,
} from "@/lib/future-orders/helpers";

type FormState = {
  customerName: string;
  phone: string;
  eventDate: string;
  eventTime: string;
  guestCount: string;
  address: string;
  notes: string;
  totalAmount: string;
  depositAmount: string;
  depositPaid: boolean;
  status: FutureOrderStatus;
};

const emptyForm = (): FormState => ({
  customerName: "",
  phone: "",
  eventDate: "",
  eventTime: "",
  guestCount: "",
  address: "",
  notes: "",
  totalAmount: "",
  depositAmount: "",
  depositPaid: false,
  status: "IN_PREPARATION",
});

const inputClass =
  "w-full rounded-xl border border-violet-200/80 bg-white/95 px-3 py-2 text-sm font-medium text-[#0f172a] outline-none focus:border-[#c9a227] focus:ring-1 focus:ring-[#c9a227]/30";

const iconBtn =
  "inline-flex h-9 w-9 items-center justify-center rounded-xl border border-violet-200/60 bg-white/90 text-[#1e1b4b] shadow-sm transition hover:border-[#c9a227]/50 hover:bg-[#faf5ff] disabled:opacity-40";

function toDateInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function rowToForm(row: FutureOrderRow): FormState {
  return {
    customerName: row.customerName,
    phone: row.phone ?? "",
    eventDate: toDateInput(row.eventDate),
    eventTime: row.eventTime ?? "",
    guestCount: row.guestCount != null ? String(row.guestCount) : "",
    address: row.address ?? "",
    notes: row.notes ?? "",
    totalAmount: String(row.totalAmount),
    depositAmount: String(row.depositAmount),
    depositPaid: row.depositPaid,
    status: (row.status as FutureOrderStatus) || "IN_PREPARATION",
  };
}

type StatusFilter = "" | FutureOrderStatus | "OVERDUE";

/**
 * מודול ייעודי לחתונות — UI premium, טבלה, סינונים; לא משותף עם הזמנות יומיות.
 */
export function WeddingOrdersHub() {
  const { t, bcp47, dir } = useI18n();
  const tL = (key: string, vars?: Record<string, string | number>) =>
    t(`admin.weddingOrders.${key}`, vars);
  const orderCategory = ORDER_CATEGORY_WEDDING;

  const [rows, setRows] = useState<FutureOrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [filterStatus, setFilterStatus] = useState<StatusFilter>("");
  const [filterMonth, setFilterMonth] = useState("");
  const [filterUpcoming, setFilterUpcoming] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<FormState>(emptyForm);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandMode, setExpandMode] = useState<"view" | "edit" | null>(null);
  const [editForm, setEditForm] = useState<FormState>(emptyForm);

  const locale = bcp47 === "ar" ? "ar-IL" : bcp47 === "en" ? "en-GB" : "he-IL";
  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString(locale, { day: "2-digit", month: "short", year: "numeric" });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ category: orderCategory });
      if (dateFrom) params.set("from", dateFrom);
      if (dateTo) params.set("to", dateTo);
      const res = await fetch(`/api/future-orders?${params}`, {
        credentials: "same-origin",
        cache: "no-store",
      });
      const j = (await res.json()) as { ok?: boolean; data?: FutureOrderRow[]; error?: string };
      if (!res.ok || !j.ok) throw new Error(j.error ?? "err");
      setRows(j.data ?? []);
    } catch {
      setError(t("admin.weddingOrders.errorLoad"));
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, t]);

  useEffect(() => {
    void load();
    // טעינה רק כשמשתנים מסנני תאריך — לא כשמתחדשת פונקציית t/tL
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFrom, dateTo]);

  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const displayedRows = useMemo(() => {
    let list = [...rows];
    if (filterStatus === "OVERDUE") {
      list = list.filter((r) => isWeddingOrderOverdue(r));
    } else if (filterStatus) {
      list = list.filter((r) => r.status === filterStatus);
    }
    if (filterMonth) {
      list = list.filter((r) => toDateInput(r.eventDate).startsWith(filterMonth));
    }
    if (filterUpcoming) {
      const soon = new Date();
      soon.setDate(soon.getDate() + 30);
      const soonIso = soon.toISOString().slice(0, 10);
      list = list.filter((r) => {
        const d = toDateInput(r.eventDate);
        return d >= todayIso && d <= soonIso && r.status !== "CANCELLED";
      });
    }
    return list.sort((a, b) => toDateInput(a.eventDate).localeCompare(toDateInput(b.eventDate)));
  }, [rows, filterStatus, filterMonth, filterUpcoming, todayIso]);

  const stats = useMemo(() => {
    const soon = new Date();
    soon.setDate(soon.getDate() + 14);
    const soonIso = soon.toISOString().slice(0, 10);
    let upcoming = 0;
    let deposits = 0;
    let remaining = 0;
    for (const r of rows) {
      if (r.status === "CANCELLED") continue;
      const d = toDateInput(r.eventDate);
      if (d >= todayIso && d <= soonIso) upcoming++;
      deposits += r.depositAmount;
      remaining += r.remainingAmount;
    }
    return {
      count: rows.filter((r) => r.status !== "CANCELLED").length,
      upcoming,
      deposits,
      remaining,
    };
  }, [rows, todayIso]);

  const monthOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      const d = toDateInput(r.eventDate);
      if (d.length >= 7) set.add(d.slice(0, 7));
    }
    return Array.from(set).sort();
  }, [rows]);

  const createRemaining = useMemo(
    () =>
      computeRemainingAmount(
        Number(createForm.totalAmount) || 0,
        Number(createForm.depositAmount) || 0,
      ),
    [createForm.totalAmount, createForm.depositAmount],
  );

  const editRemaining = useMemo(
    () =>
      computeRemainingAmount(Number(editForm.totalAmount) || 0, Number(editForm.depositAmount) || 0),
    [editForm.totalAmount, editForm.depositAmount],
  );

  const payloadFromForm = (f: FormState) => ({
    orderCategory,
    customerName: f.customerName.trim(),
    phone: f.phone.trim() || null,
    eventDate: f.eventDate,
    eventTime: f.eventTime.trim() || null,
    address: f.address.trim() || null,
    guestCount: f.guestCount.trim() ? Number(f.guestCount) : null,
    notes: f.notes.trim() || null,
    totalAmount: Number(f.totalAmount) || 0,
    depositAmount: Number(f.depositAmount) || 0,
    depositPaid: f.depositPaid,
    status: f.status,
  });

  const saveCreate = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/future-orders", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadFromForm(createForm)),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) throw new Error(j.error ?? "err");
      setCreateOpen(false);
      setCreateForm(emptyForm());
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : tL("errorSave"));
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/future-orders/${encodeURIComponent(id)}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadFromForm(editForm)),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) throw new Error(j.error ?? "err");
      setExpandedId(null);
      setExpandMode(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : tL("errorUpdate"));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm(tL("confirmDelete"))) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/future-orders/${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) throw new Error(j.error ?? "err");
      if (expandedId === id) {
        setExpandedId(null);
        setExpandMode(null);
      }
      await load();
    } catch {
      setError(tL("errorDelete"));
    } finally {
      setBusy(false);
    }
  };

  const printOrder = (row: FutureOrderRow) => {
    const overdue = isWeddingOrderOverdue(row);
    const status = t(weddingStatusI18nKey(row.status, overdue));
    const html = `<!DOCTYPE html><html dir="${dir}"><head><meta charset="utf-8"><title>#${row.orderNumber}</title>
<style>body{font-family:system-ui;padding:24px;max-width:720px;margin:0 auto;color:#0f172a}h1{color:#4c1d95}</style></head><body>
<h1>${tL("pageTitle")} #${row.orderNumber}</h1>
<table>
<tr><td>${tL("thCustomer")}</td><td>${row.customerName}</td></tr>
<tr><td>${tL("thPhone")}</td><td>${row.phone ?? "—"}</td></tr>
<tr><td>${tL("thEventDate")}</td><td>${fmtDate(row.eventDate)}</td></tr>
<tr><td>${tL("thStatus")}</td><td>${status}</td></tr>
<tr><td>${tL("thDeposit")}</td><td>${formatShekel(row.depositAmount)}</td></tr>
<tr><td>${tL("thRemaining")}</td><td>${formatShekel(row.remainingAmount)}</td></tr>
</table>
<p>${row.notes ?? ""}</p>
</body></html>`;
    const w = window.open("", "_blank", "noopener,noreferrer");
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.focus();
    w.print();
  };

  const WeddingStatusBadge = ({ row }: { row: FutureOrderRow }) => {
    const overdue = isWeddingOrderOverdue(row);
    const key = overdue ? "OVERDUE" : row.status;
    const cls = WEDDING_STATUS_BADGE_CLASS[key] ?? WEDDING_STATUS_BADGE_CLASS.IN_PREPARATION;
    return (
      <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${cls}`}>
        {t(weddingStatusI18nKey(row.status, overdue))}
      </span>
    );
  };

  const FormFields = ({
    form,
    setForm,
    remaining,
    idPrefix,
  }: {
    form: FormState;
    setForm: (f: FormState) => void;
    remaining: number;
    idPrefix: string;
  }) => (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <label className="block sm:col-span-2">
        <span className="mb-1 flex items-center gap-1 text-xs font-bold text-[#4c1d95]">
          <Calendar className="h-3.5 w-3.5 text-[#c9a227]" aria-hidden />
          {tL("fieldEventDate")}
        </span>
        <input
          type="date"
          required
          className={inputClass}
          value={form.eventDate}
          onChange={(e) => setForm({ ...form, eventDate: e.target.value })}
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-bold text-[#4c1d95]">{tL("fieldCustomerName")}</span>
        <input
          className={inputClass}
          value={form.customerName}
          onChange={(e) => setForm({ ...form, customerName: e.target.value })}
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-bold text-[#4c1d95]">{tL("fieldPhone")}</span>
        <input
          className={inputClass}
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-bold text-[#4c1d95]">{tL("fieldEventTime")}</span>
        <input
          className={inputClass}
          placeholder={tL("deliveryTimePlaceholder")}
          value={form.eventTime}
          onChange={(e) => setForm({ ...form, eventTime: e.target.value })}
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-bold text-[#4c1d95]">{tL("fieldGuestCount")}</span>
        <input
          type="number"
          min={0}
          className={inputClass}
          value={form.guestCount}
          onChange={(e) => setForm({ ...form, guestCount: e.target.value })}
        />
      </label>
      <label className="block sm:col-span-2">
        <span className="mb-1 block text-xs font-bold text-[#4c1d95]">{tL("fieldAddress")}</span>
        <input
          className={inputClass}
          value={form.address}
          onChange={(e) => setForm({ ...form, address: e.target.value })}
        />
      </label>
      <label className="block sm:col-span-3">
        <span className="mb-1 block text-xs font-bold text-[#4c1d95]">{tL("fieldNotes")}</span>
        <textarea
          className={`${inputClass} min-h-[72px]`}
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-bold text-[#4c1d95]">{tL("fieldTotalAmount")}</span>
        <input
          type="number"
          min={0}
          step="0.01"
          className={inputClass}
          value={form.totalAmount}
          onChange={(e) => setForm({ ...form, totalAmount: e.target.value })}
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-bold text-[#4c1d95]">{tL("fieldDeposit")}</span>
        <input
          type="number"
          min={0}
          step="0.01"
          className={inputClass}
          value={form.depositAmount}
          onChange={(e) => setForm({ ...form, depositAmount: e.target.value })}
        />
      </label>
      <div className="flex flex-col justify-end rounded-xl border border-dashed border-[#c9a227]/50 bg-gradient-to-br from-[#fffbeb] to-[#faf5ff] px-3 py-2">
        <span className="text-xs font-bold text-[#6b21a8]">{tL("thRemaining")}</span>
        <span className="text-lg font-black text-[#0f172a] tabular-nums">{formatShekel(remaining)}</span>
      </div>
      <label className="flex items-center gap-2 self-end">
        <input
          type="checkbox"
          checked={form.depositPaid}
          onChange={(e) => setForm({ ...form, depositPaid: e.target.checked })}
          className="h-4 w-4 rounded border-violet-300"
        />
        <span className="text-sm font-semibold text-[#4c1d95]">{tL("fieldDepositPaid")}</span>
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-bold text-[#4c1d95]">{tL("fieldStatus")}</span>
        <select
          id={`${idPrefix}-status`}
          className={inputClass}
          value={form.status}
          onChange={(e) => setForm({ ...form, status: e.target.value as FutureOrderStatus })}
        >
          {FUTURE_ORDER_STATUSES.filter((s) => s !== "PENDING").map((s) => (
            <option key={s} value={s}>
              {t(weddingStatusI18nKey(s, false))}
            </option>
          ))}
        </select>
      </label>
    </div>
  );

  const statCards = [
    { emoji: "💍", label: tL("statCount"), value: String(stats.count) },
    { emoji: "📅", label: tL("statUpcoming"), value: String(stats.upcoming) },
    { emoji: "💰", label: tL("statDeposits"), value: formatShekel(stats.deposits) },
    { emoji: "💵", label: tL("statRemaining"), value: formatShekel(stats.remaining) },
  ];

  return (
    <div className="tcg-fade-in mx-auto max-w-7xl space-y-6 px-3 pb-16 pt-4 md:px-6 md:pt-6">
      <header className="overflow-hidden rounded-2xl border border-[#c9a227]/25 bg-gradient-to-br from-[#0f172a] via-[#312e81] to-[#581c87] p-6 shadow-2xl shadow-purple-950/30 md:p-8">
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-[#fde68a]/90">
          <Gem className="h-4 w-4 text-[#c9a227]" aria-hidden />
          {tL("kicker")}
        </p>
        <h1 className="mt-2 text-2xl font-black text-white md:text-3xl lg:text-4xl">{tL("pageTitle")}</h1>
        <p className="mt-2 max-w-3xl text-sm font-medium text-violet-100/85 md:text-base">
          {tL("pageDescription")}
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {statCards.map((c) => (
          <div
            key={c.label}
            className="rounded-2xl border border-[#c9a227]/20 bg-gradient-to-br from-white via-[#faf5ff] to-[#fffbeb] p-4 shadow-md shadow-purple-900/5"
          >
            <p className="text-lg" aria-hidden>
              {c.emoji}
            </p>
            <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-[#6b21a8]/80">{c.label}</p>
            <p className="mt-1 text-xl font-black text-[#0f172a] tabular-nums">{c.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setCreateOpen((o) => !o);
            if (createOpen) setCreateForm(emptyForm());
          }}
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#c9a227] via-[#a855f7] to-[#7c3aed] px-5 py-2.5 text-sm font-black text-white shadow-lg shadow-purple-900/25 transition hover:brightness-110"
        >
          <Plus className="h-4 w-4" aria-hidden />
          {tL("createOrder")}
        </button>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading || busy}
          className="inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-white px-4 py-2.5 text-sm font-bold text-[#312e81] shadow-sm hover:bg-[#faf5ff] disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden />
          {tL("refresh")}
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-violet-200/60 bg-gradient-to-r from-[#faf5ff] to-white p-4 shadow-sm">
        <label className="block min-w-[9rem] flex-1">
          <span className="mb-1 block text-xs font-bold text-[#4c1d95]">{tL("filterByDate")}</span>
          <div className="flex gap-2">
            <input type="date" className={inputClass} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            <input type="date" className={inputClass} value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
        </label>
        <label className="block min-w-[8rem]">
          <span className="mb-1 block text-xs font-bold text-[#4c1d95]">{tL("filterByStatus")}</span>
          <select
            className={inputClass}
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as StatusFilter)}
          >
            <option value="">{tL("filterAllStatuses")}</option>
            <option value="IN_PREPARATION">{tL("statusPreparing")}</option>
            <option value="READY">{tL("statusReady")}</option>
            <option value="COMPLETED">{tL("statusDelivered")}</option>
            <option value="OVERDUE">{tL("statusOverdue")}</option>
          </select>
        </label>
        <label className="block min-w-[8rem]">
          <span className="mb-1 block text-xs font-bold text-[#4c1d95]">{tL("filterByMonth")}</span>
          <select className={inputClass} value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)}>
            <option value="">{tL("filterAllMonths")}</option>
            {monthOptions.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label className="flex cursor-pointer items-center gap-2 self-end pb-2">
          <input
            type="checkbox"
            checked={filterUpcoming}
            onChange={(e) => setFilterUpcoming(e.target.checked)}
            className="h-4 w-4 rounded border-violet-300"
          />
          <span className="text-sm font-bold text-[#4c1d95]">{tL("filterUpcoming")}</span>
        </label>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-xl bg-[#0f172a] px-4 py-2 text-sm font-bold text-[#fde68a]"
        >
          {tL("applyFilter")}
        </button>
      </div>

      {error && (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-800">
          {error}
        </p>
      )}

      {createOpen && (
        <div className="overflow-hidden rounded-2xl border border-[#c9a227]/30 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-violet-100 bg-gradient-to-r from-[#faf5ff] to-[#fffbeb] px-4 py-3">
            <h2 className="text-sm font-black text-[#4c1d95]">{tL("newOrderInline")}</h2>
            <button type="button" className={iconBtn} onClick={() => setCreateOpen(false)} aria-label={tL("cancel")}>
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="p-4">
            <FormFields form={createForm} setForm={setCreateForm} remaining={createRemaining} idPrefix="create" />
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void saveCreate()}
                className="rounded-xl bg-gradient-to-r from-[#7c3aed] to-[#4c1d95] px-5 py-2 text-sm font-black text-white disabled:opacity-50"
              >
                {busy ? tL("saving") : tL("save")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setCreateOpen(false);
                  setCreateForm(emptyForm());
                }}
                className="rounded-xl border border-violet-200 px-4 py-2 text-sm font-bold text-[#4c1d95]"
              >
                {tL("cancel")}
              </button>
            </div>
          </div>
        </div>
      )}

      {loading && rows.length === 0 ? (
        <p className="text-center text-sm font-semibold text-violet-700/70">{t("common.loading")}</p>
      ) : displayedRows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-violet-200 bg-[#faf5ff]/50 p-10 text-center text-sm font-semibold text-[#6b21a8]/80">
          {tL("emptyCreate")}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-violet-200/70 bg-white shadow-lg shadow-purple-950/5">
          <table className="min-w-[960px] w-full border-collapse text-right text-sm">
            <thead>
              <tr className="border-b border-violet-100 bg-gradient-to-l from-[#0f172a] to-[#4c1d95] text-[11px] font-bold uppercase tracking-wide text-[#fde68a]/95">
                <th className="px-3 py-3">{tL("thCustomer")}</th>
                <th className="px-3 py-3">{tL("thPhone")}</th>
                <th className="px-3 py-3">{tL("thEventDate")}</th>
                <th className="px-3 py-3">{tL("thGuests")}</th>
                <th className="px-3 py-3">{tL("thDeposit")}</th>
                <th className="px-3 py-3">{tL("thRemaining")}</th>
                <th className="px-3 py-3">{tL("thStatus")}</th>
                <th className="px-3 py-3">{tL("thDeliveryTime")}</th>
                <th className="px-3 py-3">{tL("thNotes")}</th>
                <th className="px-3 py-3 w-[120px]">{tL("thActions")}</th>
              </tr>
            </thead>
            <tbody>
              {displayedRows.map((row) => {
                const isOpen = expandedId === row.id;
                return (
                  <Fragment key={row.id}>
                    <tr
                      className="border-b border-violet-50/80 transition hover:bg-[#faf5ff]/80"
                    >
                      <td className="px-3 py-3 font-bold text-[#0f172a]">
                        <span className="text-[10px] font-semibold text-violet-400">#{row.orderNumber}</span>
                        <br />
                        {row.customerName}
                      </td>
                      <td className="px-3 py-3 text-slate-700">{row.phone ?? "—"}</td>
                      <td className="px-3 py-3 font-semibold text-[#4c1d95] whitespace-nowrap">
                        {fmtDate(row.eventDate)}
                      </td>
                      <td className="px-3 py-3 tabular-nums">{row.guestCount ?? "—"}</td>
                      <td className="px-3 py-3 font-semibold text-emerald-800 tabular-nums">
                        {formatShekel(row.depositAmount)}
                      </td>
                      <td className="px-3 py-3 font-semibold text-rose-800 tabular-nums">
                        {formatShekel(row.remainingAmount)}
                      </td>
                      <td className="px-3 py-3">
                        <WeddingStatusBadge row={row} />
                      </td>
                      <td className="px-3 py-3 text-slate-700">{row.eventTime ?? "—"}</td>
                      <td className="max-w-[140px] truncate px-3 py-3 text-slate-600" title={row.notes ?? ""}>
                        {row.notes ?? "—"}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex gap-1">
                          <button
                            type="button"
                            className={iconBtn}
                            title={tL("actionView")}
                            onClick={() => {
                              setExpandedId(row.id);
                              setExpandMode("view");
                              setEditForm(rowToForm(row));
                            }}
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            className={iconBtn}
                            title={tL("actionEdit")}
                            onClick={() => {
                              setExpandedId(row.id);
                              setExpandMode("edit");
                              setEditForm(rowToForm(row));
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            className={iconBtn}
                            title={tL("actionPdf")}
                            onClick={() => printOrder(row)}
                          >
                            <FileText className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            className={iconBtn}
                            title={tL("actionDeleteTitle")}
                            onClick={() => void remove(row.id)}
                          >
                            <Trash2 className="h-4 w-4 text-rose-600" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {isOpen ? (
                      <tr key={`${row.id}-detail`} className="bg-[#faf5ff]/60">
                        <td colSpan={10} className="px-4 py-4">
                          {expandMode === "view" ? (
                            <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
                              <div>
                                <dt className="text-xs font-bold text-[#6b21a8]">{tL("fieldAddress")}</dt>
                                <dd>{row.address || "—"}</dd>
                              </div>
                              <div>
                                <dt className="text-xs font-bold text-[#6b21a8]">{tL("fieldTotalAmount")}</dt>
                                <dd className="font-black">{formatShekel(row.totalAmount)}</dd>
                              </div>
                              <div className="sm:col-span-2 lg:col-span-3">
                                <dt className="text-xs font-bold text-[#6b21a8]">{tL("fieldNotes")}</dt>
                                <dd className="whitespace-pre-wrap">{row.notes || "—"}</dd>
                              </div>
                              <div className="sm:col-span-2 lg:col-span-3 rounded-xl border border-dashed border-[#c9a227]/40 bg-[#fffbeb]/50 p-3">
                                <p className="text-xs font-black text-[#78350f]">{tL("futureModulesTitle")}</p>
                                <ul className="mt-2 flex flex-wrap gap-2">
                                  {(
                                    [
                                      "futureFiles",
                                      "futurePhotos",
                                      "futureApprovals",
                                      "futurePayments",
                                      "futureStages",
                                    ] as const
                                  ).map((k) => (
                                    <li
                                      key={k}
                                      className="rounded-lg border border-violet-200/60 bg-white/80 px-2 py-1 text-[11px] font-semibold text-[#5b21b6]"
                                    >
                                      {tL(k)}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            </dl>
                          ) : (
                            <>
                              <FormFields
                                form={editForm}
                                setForm={setEditForm}
                                remaining={editRemaining}
                                idPrefix={`edit-${row.id}`}
                              />
                              <div className="mt-4 flex gap-2">
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => void saveEdit(row.id)}
                                  className="rounded-xl bg-[#7c3aed] px-5 py-2 text-sm font-black text-white"
                                >
                                  {tL("save")}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setExpandedId(null);
                                    setExpandMode(null);
                                  }}
                                  className="rounded-xl border border-violet-200 px-4 py-2 text-sm font-bold"
                                >
                                  {tL("cancel")}
                                </button>
                              </div>
                            </>
                          )}
                          <button
                            type="button"
                            className="mt-3 text-xs font-bold text-violet-600 hover:text-violet-900"
                            onClick={() => {
                              setExpandedId(null);
                              setExpandMode(null);
                            }}
                          >
                            {tL("collapse")}
                          </button>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="flex items-center justify-center gap-1 text-center text-[11px] font-medium text-violet-500/80">
        <CalendarHeart className="h-3.5 w-3.5" aria-hidden />
        {tL("footerHint")}
      </p>
    </div>
  );
}
