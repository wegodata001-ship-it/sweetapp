"use client";

import { AlertTriangle, CheckCircle2, Loader2, Pencil, Plus, Trash2, XCircle } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  computeRemainingAmount,
  FUTURE_ORDER_EVENT_TYPES,
  FUTURE_ORDER_STATUSES,
  STATUS_BADGE_CLASS,
  isValidStatus,
  type FutureOrderStatus,
} from "@/lib/future-orders/helpers";
import { formatShekel } from "@/lib/format-shekel";
import { useI18n } from "@/components/i18n-provider";
import {
  translateFutureOrderEventType,
  translateFutureOrderStatus,
} from "@/lib/i18n/status-keys";

type FutureOrderRow = {
  id: string;
  orderNumber: number;
  customerName: string;
  phone: string | null;
  eventType: string;
  eventDate: string;
  eventTime: string | null;
  itemsDescription: string | null;
  totalAmount: number;
  depositAmount: number;
  remainingAmount: number;
  depositPaid: boolean;
  status: string;
  isCompleted: boolean;
  completedAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

function eventDateInputValue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const STATUS_OPTIONS: FutureOrderStatus[] = [...FUTURE_ORDER_STATUSES];

export default function FutureOrdersAdminPage() {
  const { t } = useI18n();
  const [rows, setRows] = useState<FutureOrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<"create" | "edit" | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [eventType, setEventType] = useState<string>(FUTURE_ORDER_EVENT_TYPES[0]);
  const [eventDate, setEventDate] = useState("");
  const [eventTime, setEventTime] = useState("");
  const [itemsDescription, setItemsDescription] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [depositAmount, setDepositAmount] = useState("");
  const [depositPaid, setDepositPaid] = useState(false);
  const [status, setStatus] = useState<FutureOrderStatus>("PENDING");
  const [notes, setNotes] = useState("");

  const remainingPreview = useMemo(() => {
    const total = Math.max(0, Number(totalAmount.replace(/,/g, ".")) || 0);
    const dep = Math.max(0, Number(depositAmount.replace(/,/g, ".")) || 0);
    return computeRemainingAmount(total, dep);
  }, [totalAmount, depositAmount]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setRows([]);
    try {
      const res = await fetch("/api/future-orders", { credentials: "same-origin", cache: "no-store" });
      const j = (await res.json()) as { ok?: boolean; data?: FutureOrderRow[]; error?: string };
      if (!j.ok) {
        setError(j.error ?? t("admin.futureOrders.errorLoad"));
        return;
      }
      setRows(j.data ?? []);
    } catch {
      setError(t("admin.futureOrders.errorLoad"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, [load]);

  const resetForm = () => {
    setCustomerName("");
    setPhone("");
    setEventType(FUTURE_ORDER_EVENT_TYPES[0]);
    setEventDate("");
    setEventTime("");
    setItemsDescription("");
    setTotalAmount("");
    setDepositAmount("");
    setDepositPaid(false);
    setStatus("PENDING");
    setNotes("");
    setEditId(null);
  };

  const openCreate = () => {
    resetForm();
    const now = new Date();
    setEventDate(
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`,
    );
    setModal("create");
  };

  const openEdit = (row: FutureOrderRow) => {
    setEditId(row.id);
    setCustomerName(row.customerName);
    setPhone(row.phone ?? "");
    setEventType(row.eventType);
    setEventDate(eventDateInputValue(row.eventDate));
    setEventTime(row.eventTime ?? "");
    setItemsDescription(row.itemsDescription ?? "");
    setTotalAmount(String(row.totalAmount));
    setDepositAmount(String(row.depositAmount));
    setDepositPaid(row.depositPaid);
    setStatus((row.status as FutureOrderStatus) ?? "PENDING");
    setNotes(row.notes ?? "");
    setModal("edit");
  };

  const closeModal = () => {
    setModal(null);
    resetForm();
  };

  const submitForm = async () => {
    setSaving(true);
    setError(null);
    try {
      const total = Math.max(0, Number(totalAmount.replace(/,/g, ".")) || 0);
      const dep = Math.max(0, Number(depositAmount.replace(/,/g, ".")) || 0);
      if (dep > total + 1e-9) {
        setError(t("admin.futureOrders.errorDepositTooHigh"));
        return;
      }
      const body = {
        customerName: customerName.trim(),
        phone: phone.trim() || null,
        eventType,
        eventDate,
        eventTime: eventTime.trim() || null,
        itemsDescription: itemsDescription.trim() || null,
        totalAmount: total,
        depositAmount: dep,
        depositPaid,
        status,
        notes: notes.trim() || null,
      };
      if (modal === "create") {
        const res = await fetch("/api/future-orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify(body),
        });
        const j = (await res.json()) as { ok?: boolean; error?: string };
        if (!j.ok) {
          setError(j.error ?? t("admin.futureOrders.errorSave"));
          return;
        }
      } else if (modal === "edit" && editId) {
        const res = await fetch(`/api/future-orders/${encodeURIComponent(editId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify(body),
        });
        const j = (await res.json()) as { ok?: boolean; error?: string };
        if (!j.ok) {
          setError(j.error ?? t("admin.futureOrders.errorUpdate"));
          return;
        }
      }
      closeModal();
      await load();
    } finally {
      setSaving(false);
    }
  };

  const completeOrder = async (id: string) => {
    if (!confirm(t("admin.futureOrders.confirmComplete"))) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/future-orders/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ complete: true }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!j.ok) {
        setError(j.error ?? t("admin.futureOrders.errorAction"));
        return;
      }
      await load();
    } finally {
      setSaving(false);
    }
  };

  const patchQuick = async (id: string, patch: Record<string, unknown>) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/future-orders/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(patch),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!j.ok) {
        setError(j.error ?? t("admin.futureOrders.errorUpdate"));
        return;
      }
      await load();
    } finally {
      setSaving(false);
    }
  };

  const deleteRow = async (id: string) => {
    if (!confirm(t("admin.futureOrders.confirmDelete"))) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/future-orders/${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!j.ok) {
        setError(j.error ?? t("admin.futureOrders.errorDelete"));
        return;
      }
      await load();
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    "mt-1 block h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-right text-sm font-semibold text-slate-900 shadow-sm outline-none focus:border-luxury-gold focus:ring-2 focus:ring-luxury-gold/25";

  return (
    <div className="mx-auto max-w-[1600px] space-y-4 p-4 md:p-6" dir="rtl">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-cyan-700">{t("admin.futureOrders.kicker")}</p>
          <h1 className="mt-1 text-2xl font-black text-slate-950 md:text-3xl">{t("admin.futureOrders.pageTitle")}</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            {t("admin.futureOrders.pageDescription")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/"
            className="inline-flex h-11 items-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-800 hover:bg-slate-50"
          >
            {t("admin.futureOrders.backToDashboard")}
          </Link>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {t("admin.futureOrders.refresh")}
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-luxury-gold px-4 text-sm font-black text-luxury-charcoal shadow-sm hover:bg-luxury-gold-hover"
          >
            <Plus className="h-4 w-4" aria-hidden />
            {t("admin.futureOrders.createOrder")}
          </button>
        </div>
      </div>

      <section className="rounded-2xl border border-amber-200/80 bg-amber-50/60 p-4 text-sm text-amber-950">
        <p className="flex items-center gap-2 font-black">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
          {t("admin.futureOrders.alertsTitle")}
        </p>
        <ul className="mt-2 list-inside list-disc space-y-1 font-semibold text-amber-950/90">
          <li>{t("admin.futureOrders.alertItemSoon")}</li>
          <li>{t("admin.futureOrders.alertItemNoDeposit")}</li>
          <li>{t("admin.futureOrders.alertItemBalance")}</li>
        </ul>
      </section>

      {error && (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-800" role="alert">
          {error}
          <button type="button" className="ms-3 underline" onClick={() => setError(null)}>
            {t("admin.futureOrders.closeAlert")}
          </button>
        </p>
      )}

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[1100px] divide-y divide-slate-100 text-right text-[13px]">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-3 py-2 font-bold text-slate-600">#</th>
              <th className="px-3 py-2 font-bold text-slate-600">{t("admin.futureOrders.thCustomer")}</th>
              <th className="px-3 py-2 font-bold text-slate-600">{t("admin.futureOrders.thPhone")}</th>
              <th className="px-3 py-2 font-bold text-slate-600">{t("admin.futureOrders.thDate")}</th>
              <th className="px-3 py-2 font-bold text-slate-600">{t("admin.futureOrders.thType")}</th>
              <th className="px-3 py-2 font-bold text-slate-600">{t("admin.futureOrders.thTotal")}</th>
              <th className="px-3 py-2 font-bold text-slate-600">{t("admin.futureOrders.thDepositCol")}</th>
              <th className="px-3 py-2 font-bold text-slate-600">{t("admin.futureOrders.thRemainingPay")}</th>
              <th className="px-3 py-2 font-bold text-slate-600">{t("admin.futureOrders.thDepositStatus")}</th>
              <th className="px-3 py-2 font-bold text-slate-600">{t("admin.futureOrders.fieldStatus")}</th>
              <th className="px-3 py-2 font-bold text-slate-600">{t("admin.futureOrders.thCompleted")}</th>
              <th className="px-3 py-2 font-bold text-slate-600">{t("admin.futureOrders.thActions")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && (
              <tr>
                <td colSpan={12} className="px-3 py-8 text-center font-semibold text-slate-500">
                  <Loader2 className="mx-auto h-6 w-6 animate-spin text-cyan-600" aria-hidden />
                </td>
              </tr>
            )}
            {!loading &&
              rows.map((r) => {
                const st: FutureOrderStatus = isValidStatus(r.status) ? r.status : "PENDING";
                const today = new Date();
                const ed = new Date(r.eventDate);
                const dayDiff = Math.round(
                  (new Date(ed.getFullYear(), ed.getMonth(), ed.getDate()).getTime() -
                    new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) /
                    86400000,
                );
                const soon = !r.isCompleted && r.status !== "CANCELLED" && r.status !== "COMPLETED" && dayDiff >= 0 && dayDiff <= 3;
                return (
                  <tr key={r.id} className="hover:bg-slate-50/80">
                    <td className="px-3 py-2 font-black text-slate-900">{r.orderNumber}</td>
                    <td className="px-3 py-2 font-bold text-slate-900">{r.customerName}</td>
                    <td className="px-3 py-2 text-slate-700">{r.phone ?? "—"}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-slate-700">
                      {eventDateInputValue(r.eventDate)}
                      {r.eventTime ? ` · ${r.eventTime}` : ""}
                      {soon ? (
                        <span className="me-1 inline-flex rounded-full border border-cyan-300 bg-cyan-50 px-1.5 py-0.5 text-[10px] font-black text-cyan-900">
                          {t("admin.futureOrders.soonBadge")}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-slate-700">{translateFutureOrderEventType(t, r.eventType)}</td>
                    <td className="px-3 py-2 font-semibold">{formatShekel(r.totalAmount)}</td>
                    <td className="px-3 py-2 font-semibold">{formatShekel(r.depositAmount)}</td>
                    <td className="px-3 py-2 font-black text-amber-900">{formatShekel(r.remainingAmount)}</td>
                    <td className="px-3 py-2">
                      {r.depositPaid ? (
                        <span className="inline-flex rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[11px] font-black text-emerald-800">
                          {t("admin.futureOrders.depositPaidBadge")}
                        </span>
                      ) : (r.depositAmount ?? 0) > 1e-6 ? (
                        <span className="inline-flex rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-black text-amber-950">
                          {t("admin.futureOrders.depositUnpaidBadge")}
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full border border-orange-300 bg-orange-50 px-2 py-0.5 text-[11px] font-black text-orange-900">
                          {t("admin.futureOrders.noDepositBadge")}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-black ${STATUS_BADGE_CLASS[st]}`}>
                        {translateFutureOrderStatus(t, st)}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {r.isCompleted ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700">
                          <CheckCircle2 className="h-4 w-4" aria-hidden /> {t("admin.futureOrders.yes")}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-slate-500">
                          <XCircle className="h-4 w-4" aria-hidden /> {t("admin.futureOrders.no")}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap justify-end gap-1">
                        <button
                          type="button"
                          title={t("admin.futureOrders.actionEdit")}
                          onClick={() => openEdit(r)}
                          disabled={saving}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          title={t("admin.futureOrders.actionCompleteTitle")}
                          disabled={saving || r.isCompleted || r.status === "CANCELLED"}
                          onClick={() => void completeOrder(r.id)}
                          className="rounded-lg border border-emerald-300 bg-emerald-50 px-2 py-1 text-[11px] font-black text-emerald-900 disabled:opacity-40"
                        >
                          {t("admin.futureOrders.actionCompleteShort")}
                        </button>
                        <button
                          type="button"
                          title={t("admin.futureOrders.actionDeleteTitle")}
                          onClick={() => void deleteRow(r.id)}
                          disabled={saving}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="mt-2 flex flex-wrap justify-end gap-1">
                        <select
                          value={r.status}
                          disabled={saving || r.isCompleted}
                          onChange={(e) => void patchQuick(r.id, { status: e.target.value })}
                          className="max-w-[140px] rounded-lg border border-slate-200 bg-white px-1 py-1 text-[11px] font-bold"
                        >
                          {STATUS_OPTIONS.map((s) => (
                            <option key={s} value={s}>
                              {translateFutureOrderStatus(t, s)}
                            </option>
                          ))}
                        </select>
                        <label className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-bold text-slate-800">
                          <input
                            type="checkbox"
                            checked={r.depositPaid}
                            disabled={saving || r.isCompleted}
                            onChange={(e) => void patchQuick(r.id, { depositPaid: e.target.checked })}
                          />
                          {t("admin.futureOrders.depositPaidLabel")}
                        </label>
                      </div>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
        {!loading && rows.length === 0 && (
          <p className="p-8 text-center text-sm font-semibold text-slate-500">{t("admin.futureOrders.emptyCreate")}</p>
        )}
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 p-4" role="dialog" aria-modal="true">
          <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-lg font-black text-slate-950">
                {modal === "create" ? t("admin.futureOrders.modalCreateTitle") : t("admin.futureOrders.modalEditTitle")}
              </h2>
              <button type="button" onClick={closeModal} className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-bold">
                {t("admin.futureOrders.modalClose")}
              </button>
            </div>

            <div className="mt-4 grid gap-3">
              <label className="text-xs font-bold text-slate-800">
                {t("admin.futureOrders.fieldCustomerName")}
                <input className={inputClass} value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
              </label>
              <label className="text-xs font-bold text-slate-800">
                {t("admin.futureOrders.fieldPhone")}
                <input className={inputClass} value={phone} onChange={(e) => setPhone(e.target.value)} />
              </label>
              <label className="text-xs font-bold text-slate-800">
                {t("admin.futureOrders.fieldEventType")}
                <select className={inputClass} value={eventType} onChange={(e) => setEventType(e.target.value)}>
                  {FUTURE_ORDER_EVENT_TYPES.map((et) => (
                    <option key={et} value={et}>
                      {translateFutureOrderEventType(t, et)}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs font-bold text-slate-800">
                  {t("admin.futureOrders.fieldEventDate")}
                  <input type="date" className={inputClass} value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
                </label>
                <label className="text-xs font-bold text-slate-800">
                  {t("admin.futureOrders.fieldEventTime")}
                  <input type="time" className={inputClass} value={eventTime} onChange={(e) => setEventTime(e.target.value)} />
                </label>
              </div>
              <label className="text-xs font-bold text-slate-800">
                {t("admin.futureOrders.fieldItemsDescription")}
                <textarea
                  className={`${inputClass} min-h-[88px] py-2`}
                  value={itemsDescription}
                  onChange={(e) => setItemsDescription(e.target.value)}
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs font-bold text-slate-800">
                  {t("admin.futureOrders.fieldTotalAmount")}
                  <input className={inputClass} inputMode="decimal" value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)} />
                </label>
                <label className="text-xs font-bold text-slate-800">
                  {t("admin.futureOrders.fieldDeposit")}
                  <input className={inputClass} inputMode="decimal" value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} />
                </label>
              </div>
              <p className="rounded-xl border border-amber-100 bg-amber-50/80 px-3 py-2 text-sm font-black text-amber-950">
                {t("admin.futureOrders.fieldRemainingPreview", { amount: formatShekel(remainingPreview) })}
              </p>
              <label className="flex items-center gap-2 text-xs font-bold text-slate-800">
                <input type="checkbox" checked={depositPaid} onChange={(e) => setDepositPaid(e.target.checked)} />
                {t("admin.futureOrders.fieldDepositPaid")}
              </label>
              <label className="text-xs font-bold text-slate-800">
                {t("admin.futureOrders.fieldStatus")}
                <select className={inputClass} value={status} onChange={(e) => setStatus(e.target.value as FutureOrderStatus)}>
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {translateFutureOrderStatus(t, s)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-bold text-slate-800">
                {t("admin.futureOrders.fieldNotes")}
                <textarea className={`${inputClass} min-h-[72px] py-2`} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </label>
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => void submitForm()}
                className="rounded-xl bg-cyan-600 px-4 py-2 text-sm font-black text-white hover:bg-cyan-700 disabled:opacity-50"
              >
                {saving ? t("admin.futureOrders.saving") : t("admin.futureOrders.save")}
              </button>
              <button type="button" onClick={closeModal} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700">
                {t("admin.futureOrders.cancel")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
