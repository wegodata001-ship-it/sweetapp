"use client";

import {
  Calendar,
  Eye,
  FileText,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { formatShekel } from "@/lib/format-shekel";
import {
  DAILY_GRADIENT,
  FUTURE_ORDER_STATUSES,
  moduleToCategory,
  ORDER_CATEGORY_DAILY,
  statusI18nKey,
  STATUS_BADGE_CLASS,
  WEDDING_GRADIENT,
  computeRemainingAmount,
  type FutureOrderStatus,
  type OrdersModule,
} from "@/lib/future-orders/helpers";

export type FutureOrderRow = {
  id: string;
  orderNumber: number;
  customerName: string;
  phone: string | null;
  eventType: string;
  eventDate: string;
  eventTime: string | null;
  address: string | null;
  guestCount: number | null;
  itemsDescription: string | null;
  totalAmount: number;
  depositAmount: number;
  remainingAmount: number;
  depositPaid: boolean;
  status: string;
  notes: string | null;
  isCompleted: boolean;
};

type FormState = {
  customerName: string;
  phone: string;
  eventDate: string;
  eventTime: string;
  guestCount: string;
  address: string;
  notes: string;
  itemsDescription: string;
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
  itemsDescription: "",
  totalAmount: "",
  depositAmount: "",
  depositPaid: false,
  status: "PENDING",
});

const inputClass =
  "w-full rounded-xl border border-slate-200/90 bg-white/95 px-3 py-2 text-sm font-medium text-slate-900 outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-300/40";

const iconBtn =
  "inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200/90 bg-white text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-40";

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
    itemsDescription: row.itemsDescription ?? "",
    totalAmount: String(row.totalAmount),
    depositAmount: String(row.depositAmount),
    depositPaid: row.depositPaid,
    status: (row.status as FutureOrderStatus) || "PENDING",
  };
}

export type OrdersHubProps = {
  module: OrdersModule;
  canManage: boolean;
};

export function OrdersHub({ module, canManage }: OrdersHubProps) {
  const { t, bcp47, dir } = useI18n();
  const isWedding = module === "wedding";
  const i18nRoot = isWedding ? "admin.weddingOrders" : "admin.dailyOrders";
  const tL = (key: string) => t(`${i18nRoot}.${key}`);
  const orderCategory = moduleToCategory(module);
  const accent = isWedding ? WEDDING_GRADIENT : DAILY_GRADIENT;
  const [rows, setRows] = useState<FutureOrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showDateFilter, setShowDateFilter] = useState(false);

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
      setError(t(`${i18nRoot}.errorLoad`));
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, orderCategory, i18nRoot, t]);

  useEffect(() => {
    void load();
    // load נקרא רק כשמשתנים מסנן/מודול — לא כשמתחדשת פונקציית t
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderCategory, dateFrom, dateTo]);

  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const stats = useMemo(() => {
    if (isWedding) {
      const soon = new Date();
      soon.setDate(soon.getDate() + 14);
      const soonIso = soon.toISOString().slice(0, 10);
      let upcoming = 0;
      let deposits = 0;
      let remaining = 0;
      let approvals = 0;
      let preparing = 0;
      for (const r of rows) {
        const d = toDateInput(r.eventDate);
        if (d >= todayIso && d <= soonIso && r.status !== "CANCELLED") upcoming++;
        deposits += r.depositAmount;
        remaining += r.remainingAmount;
        if (r.depositPaid) approvals++;
        if (r.status === "IN_PREPARATION") preparing++;
      }
      return {
        cards: [
          { label: tL("statUpcoming"), value: String(upcoming) },
          { label: tL("statDeposits"), value: formatShekel(deposits) },
          { label: tL("statRemaining"), value: formatShekel(remaining) },
          { label: tL("statApprovals"), value: String(approvals) },
          { label: tL("statPreparing"), value: String(preparing) },
        ],
      };
    }
    let todayCount = 0;
    let open = 0;
    let awaiting = 0;
    let paid = 0;
    let balance = 0;
    for (const r of rows) {
      const d = toDateInput(r.eventDate);
      if (d === todayIso) todayCount++;
      if (!r.isCompleted && r.status !== "CANCELLED") open++;
      if (r.status === "READY") awaiting++;
      if (r.remainingAmount <= 0.01) paid++;
      balance += r.remainingAmount;
    }
    return {
      cards: [
        { label: tL("statToday"), value: String(todayCount) },
        { label: tL("statOpen"), value: String(open) },
        { label: tL("statAwaiting"), value: String(awaiting) },
        { label: tL("statPaid"), value: String(paid) },
        { label: tL("statBalance"), value: formatShekel(balance) },
      ],
    };
  }, [rows, isWedding, todayIso, tL]);

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
      computeRemainingAmount(
        Number(editForm.totalAmount) || 0,
        Number(editForm.depositAmount) || 0,
      ),
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
    itemsDescription: f.itemsDescription.trim() || null,
    notes: f.notes.trim() || null,
    totalAmount: Number(f.totalAmount) || 0,
    depositAmount: Number(f.depositAmount) || 0,
    depositPaid: f.depositPaid,
    status: f.status,
  });

  const saveCreate = async () => {
    if (!canManage) return;
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
    if (!canManage) return;
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
    if (!canManage || !confirm(tL("confirmDelete"))) return;
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

  const openView = (row: FutureOrderRow) => {
    setExpandedId(row.id);
    setExpandMode("view");
    setEditForm(rowToForm(row));
  };

  const openEdit = (row: FutureOrderRow) => {
    if (!canManage) return;
    setExpandedId(row.id);
    setExpandMode("edit");
    setEditForm(rowToForm(row));
  };

  const printOrder = (row: FutureOrderRow) => {
    const s = (FUTURE_ORDER_STATUSES as readonly string[]).includes(row.status)
      ? (row.status as FutureOrderStatus)
      : "PENDING";
    const status = t(statusI18nKey(s, module));
    const html = `<!DOCTYPE html><html dir="${dir}"><head><meta charset="utf-8"><title>#${row.orderNumber}</title>
<style>body{font-family:system-ui;padding:24px;max-width:640px;margin:0 auto}h1{font-size:1.25rem}table{width:100%;border-collapse:collapse}td{padding:6px 0;border-bottom:1px solid #eee}</style></head><body>
<h1>${tL("pageTitle")} #${row.orderNumber}</h1>
<table>
<tr><td>${tL("fieldCustomerName")}</td><td>${row.customerName}</td></tr>
<tr><td>${tL("fieldPhone")}</td><td>${row.phone ?? "—"}</td></tr>
<tr><td>${tL("fieldEventDate")}</td><td>${fmtDate(row.eventDate)} ${row.eventTime ?? ""}</td></tr>
<tr><td>${tL("fieldStatus")}</td><td>${status}</td></tr>
<tr><td>${tL("fieldTotalAmount")}</td><td>${formatShekel(row.totalAmount)}</td></tr>
<tr><td>${tL("fieldDeposit")}</td><td>${formatShekel(row.depositAmount)}</td></tr>
<tr><td>${tL("thRemainingPay")}</td><td>${formatShekel(row.remainingAmount)}</td></tr>
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

  const PaymentBadge = ({ remaining }: { remaining: number }) =>
    remaining > 0.01 ? (
      <span className="rounded-full border border-rose-300/80 bg-rose-50 px-2 py-0.5 text-[10px] font-black text-rose-800">
        {tL("badgeRemaining")}
      </span>
    ) : (
      <span className="rounded-full border border-emerald-400/80 bg-emerald-50 px-2 py-0.5 text-[10px] font-black text-emerald-900">
        {tL("badgePaidFull")}
      </span>
    );

  const StatusBadge = ({ status }: { status: string }) => {
    const s = (FUTURE_ORDER_STATUSES as readonly string[]).includes(status)
      ? (status as FutureOrderStatus)
      : "PENDING";
    return (
      <span
        className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${STATUS_BADGE_CLASS[s]}`}
      >
        {t(statusI18nKey(s, module))}
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
        <span className="mb-1 block text-xs font-bold text-slate-600">
          {tL("fieldCustomerName")}
        </span>
        <input
          className={inputClass}
          value={form.customerName}
          onChange={(e) => setForm({ ...form, customerName: e.target.value })}
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-bold text-slate-600">
          {tL("fieldPhone")}
        </span>
        <input
          className={inputClass}
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
        />
      </label>
      {!isWedding ? (
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-xs font-bold text-slate-600">
            {tL("fieldItemsDescription")}
          </span>
          <input
            className={inputClass}
            value={form.itemsDescription}
            onChange={(e) => setForm({ ...form, itemsDescription: e.target.value })}
          />
        </label>
      ) : null}
      <label className="block">
        <span className="mb-1 block text-xs font-bold text-slate-600">
          {tL("fieldEventDate")}
        </span>
        <input
          type="date"
          className={inputClass}
          value={form.eventDate}
          onChange={(e) => setForm({ ...form, eventDate: e.target.value })}
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-bold text-slate-600">
          {tL("fieldEventTime")}
        </span>
        <input
          className={inputClass}
          value={form.eventTime}
          onChange={(e) => setForm({ ...form, eventTime: e.target.value })}
        />
      </label>
      {isWedding ? (
        <label className="block">
          <span className="mb-1 block text-xs font-bold text-slate-600">
            {tL("fieldGuestCount")}
          </span>
          <input
            type="number"
            min={0}
            className={inputClass}
            value={form.guestCount}
            onChange={(e) => setForm({ ...form, guestCount: e.target.value })}
          />
        </label>
      ) : null}
      <label className="block sm:col-span-2">
        <span className="mb-1 block text-xs font-bold text-slate-600">
          {tL("fieldAddress")}
        </span>
        <input
          className={inputClass}
          value={form.address}
          onChange={(e) => setForm({ ...form, address: e.target.value })}
        />
      </label>
      <label className="block sm:col-span-3">
        <span className="mb-1 block text-xs font-bold text-slate-600">
          {tL("fieldNotes")}
        </span>
        <textarea
          className={`${inputClass} min-h-[72px]`}
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-bold text-slate-600">
          {tL("fieldTotalAmount")}
        </span>
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
        <span className="mb-1 block text-xs font-bold text-slate-600">
          {tL("fieldDeposit")}
        </span>
        <input
          type="number"
          min={0}
          step="0.01"
          className={inputClass}
          value={form.depositAmount}
          onChange={(e) => setForm({ ...form, depositAmount: e.target.value })}
        />
      </label>
      <div
        className={`flex flex-col justify-end rounded-xl border border-dashed px-3 py-2 ${
          isWedding ? "border-rose-200/80 bg-rose-50/40" : "border-sky-200/80 bg-sky-50/40"
        }`}
      >
        <span className={`text-xs font-bold ${isWedding ? "text-rose-800" : "text-sky-800"}`}>
          {tL("thRemainingPay")}
        </span>
        <span className={`text-lg font-black ${isWedding ? "text-rose-950" : "text-sky-950"}`}>
          {formatShekel(remaining)}
        </span>
      </div>
      {isWedding ? (
        <label className="flex items-center gap-2 self-end sm:col-span-2">
          <input
            type="checkbox"
            checked={form.depositPaid}
            onChange={(e) => setForm({ ...form, depositPaid: e.target.checked })}
            className="h-4 w-4 rounded border-slate-300"
          />
          <span className="text-sm font-semibold text-slate-700">{tL("fieldDepositPaid")}</span>
        </label>
      ) : null}
      <label className="block">
        <span className="mb-1 block text-xs font-bold text-slate-600">
          {tL("fieldStatus")}
        </span>
        <select
          id={`${idPrefix}-status`}
          className={inputClass}
          value={form.status}
          onChange={(e) => setForm({ ...form, status: e.target.value as FutureOrderStatus })}
        >
          {FUTURE_ORDER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(statusI18nKey(s, module))}
            </option>
          ))}
        </select>
      </label>
    </div>
  );

  return (
    <div className="tcg-fade-in mx-auto max-w-6xl space-y-6 px-3 pb-16 pt-4 md:px-6 md:pt-6">
      <header
        className={`overflow-hidden rounded-2xl border p-6 shadow-xl md:p-8 ${
          isWedding
            ? "border-rose-200/60 bg-gradient-to-br from-rose-950 via-fuchsia-900 to-amber-900/90"
            : "border-slate-200/80 bg-gradient-to-br from-slate-800 via-slate-700 to-sky-900"
        }`}
      >
        <p
          className={`text-xs font-bold uppercase tracking-[0.2em] ${
            isWedding ? "text-rose-200/90" : "text-sky-200/90"
          }`}
        >
          {tL("kicker")}
        </p>
        <h1 className="mt-2 text-2xl font-black text-white md:text-3xl lg:text-4xl">
          {tL("pageTitle")}
        </h1>
        <p className="mt-2 max-w-2xl text-sm font-medium text-white/80 md:text-base">
          {tL("pageDescription")}
        </p>
      </header>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 lg:gap-3">
        {stats.cards.map((c) => (
          <div
            key={c.label}
            className="rounded-xl border border-slate-200/90 bg-white/95 px-3 py-3 shadow-sm"
          >
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{c.label}</p>
            <p className="mt-1 text-lg font-black text-slate-900">{c.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {canManage && (
          <button
            type="button"
            onClick={() => {
              setCreateOpen((o) => !o);
              if (createOpen) setCreateForm(emptyForm());
            }}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-black text-white shadow-md transition hover:brightness-110 ${
              isWedding
                ? "bg-gradient-to-r from-rose-600 to-amber-500"
                : "bg-gradient-to-r from-sky-600 to-indigo-600"
            }`}
          >
            <Plus className="h-4 w-4" aria-hidden />
            {tL("createOrder")}
          </button>
        )}
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading || busy}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden />
          {tL("refresh")}
        </button>
        <button
          type="button"
          onClick={() => setShowDateFilter((s) => !s)}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-800 shadow-sm transition hover:bg-slate-50"
        >
          <Calendar className="h-4 w-4" aria-hidden />
          {tL("filterByDate")}
        </button>
      </div>

      {showDateFilter && (
        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200/90 bg-white/95 p-4 shadow-sm transition-all">
          <label className="block">
            <span className="mb-1 block text-xs font-bold text-slate-600">
              {tL("dateFrom")}
            </span>
            <input
              type="date"
              className={inputClass}
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-bold text-slate-600">
              {tL("dateTo")}
            </span>
            <input
              type="date"
              className={inputClass}
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </label>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white"
          >
            {tL("applyFilter")}
          </button>
        </div>
      )}

      {error && (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-800">
          {error}
        </p>
      )}

      {createOpen && canManage && (
        <div
          className={`overflow-hidden rounded-2xl border bg-white shadow-lg transition-all ${
            isWedding ? "border-rose-200/80" : "border-sky-200/80"
          }`}
        >
          <div
            className={`flex items-center justify-between border-b px-4 py-3 ${
              isWedding
                ? "border-rose-100 bg-gradient-to-r from-rose-50 to-amber-50"
                : "border-sky-100 bg-gradient-to-r from-sky-50 to-indigo-50"
            }`}
          >
            <h2 className={`text-sm font-black ${isWedding ? "text-rose-950" : "text-sky-950"}`}>
              {tL("newOrderInline")}
            </h2>
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
                className={`rounded-xl px-5 py-2 text-sm font-black text-white disabled:opacity-50 ${
                  isWedding ? "bg-rose-700" : "bg-sky-700"
                }`}
              >
                {busy ? tL("saving") : tL("save")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setCreateOpen(false);
                  setCreateForm(emptyForm());
                }}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700"
              >
                {tL("cancel")}
              </button>
            </div>
          </div>
        </div>
      )}

      {loading && rows.length === 0 ? (
        <p className="text-center text-sm font-semibold text-slate-500">{t("common.loading")}</p>
      ) : rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-200 bg-white/80 p-10 text-center text-sm font-semibold text-slate-500">
          {tL("emptyCreate")}
        </p>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => {
            const isOpen = expandedId === row.id;
            return (
              <li key={row.id} className="list-none">
                <article
                  className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm transition hover:shadow-md"
                  style={{
                    borderInlineStartWidth: 4,
                    borderInlineStartColor: accent.to,
                  }}
                >
                  <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-bold text-slate-400">#{row.orderNumber}</span>
                        <StatusBadge status={row.status} />
                        <PaymentBadge remaining={row.remainingAmount} />
                      </div>
                      <p className="truncate text-base font-black text-slate-950">{row.customerName}</p>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-slate-600">
                        {row.phone && <span>{row.phone}</span>}
                        <span>{fmtDate(row.eventDate)}</span>
                        {row.eventTime && <span>{row.eventTime}</span>}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-sm">
                      <div className="text-end">
                        <p className="text-[10px] font-bold uppercase text-slate-400">
                          {tL("thTotal")}
                        </p>
                        <p className="font-black text-slate-900">{formatShekel(row.totalAmount)}</p>
                      </div>
                      <div className="text-end">
                        <p className="text-[10px] font-bold uppercase text-slate-400">
                          {tL("thDepositCol")}
                        </p>
                        <p className="font-bold text-emerald-800">{formatShekel(row.depositAmount)}</p>
                      </div>
                      <div className="text-end">
                        <p className="text-[10px] font-bold uppercase text-slate-400">
                          {tL("thRemainingPay")}
                        </p>
                        <p className="font-bold text-rose-800">{formatShekel(row.remainingAmount)}</p>
                      </div>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          className={iconBtn}
                          title={tL("actionView")}
                          onClick={() => openView(row)}
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        {canManage && (
                          <>
                            <button
                              type="button"
                              className={iconBtn}
                              title={tL("actionEdit")}
                              onClick={() => openEdit(row)}
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              className={iconBtn}
                              title={tL("actionDeleteTitle")}
                              onClick={() => void remove(row.id)}
                            >
                              <Trash2 className="h-4 w-4 text-rose-600" />
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          className={iconBtn}
                          title={tL("actionPdf")}
                          onClick={() => printOrder(row)}
                        >
                          <FileText className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {isOpen && (
                    <div className="border-t border-slate-100 bg-slate-50/80 px-4 py-4 transition-all">
                      {expandMode === "view" ? (
                        <dl className="grid gap-2 text-sm sm:grid-cols-2">
                          <div>
                            <dt className="text-xs font-bold text-slate-500">{tL("fieldAddress")}</dt>
                            <dd>{row.address || "—"}</dd>
                          </div>
                          <div>
                            <dt className="text-xs font-bold text-slate-500">{tL("fieldGuestCount")}</dt>
                            <dd>{row.guestCount ?? "—"}</dd>
                          </div>
                          <div className="sm:col-span-2">
                            <dt className="text-xs font-bold text-slate-500">{tL("fieldNotes")}</dt>
                            <dd className="whitespace-pre-wrap">{row.notes || "—"}</dd>
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
                              className={`rounded-xl px-5 py-2 text-sm font-black text-white ${
                                isWedding ? "bg-rose-700" : "bg-sky-700"
                              }`}
                            >
                              {tL("save")}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setExpandedId(null);
                                setExpandMode(null);
                              }}
                              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold"
                            >
                              {tL("cancel")}
                            </button>
                          </div>
                        </>
                      )}
                      <button
                        type="button"
                        className="mt-3 text-xs font-bold text-slate-500 hover:text-slate-800"
                        onClick={() => {
                          setExpandedId(null);
                          setExpandMode(null);
                        }}
                      >
                        {tL("collapse")}
                      </button>
                    </div>
                  )}
                </article>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
