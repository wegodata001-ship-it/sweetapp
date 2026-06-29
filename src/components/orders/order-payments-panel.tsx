"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Ban, Loader2, Plus } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { formatShekel } from "@/lib/format-shekel";
import { translatePaymentMethod } from "@/lib/finance/payment-methods-i18n";

export type OrderPaymentKind = "DEPOSIT" | "PAYMENT" | "REFUND";

type OrderPayment = {
  id: string;
  kind: string;
  amount: number;
  paymentMethod: string | null;
  paidAt: string;
  notes: string | null;
  status: string;
  cancelledAt: string | null;
};

const METHOD_OPTIONS = ["CASH", "TRANSFER", "CREDIT", "CHECK", "BIT", "PAYBOX", "OTHER"] as const;
const KIND_OPTIONS: readonly OrderPaymentKind[] = ["DEPOSIT", "PAYMENT", "REFUND"];

const inputClass =
  "w-full rounded-xl border border-slate-200/90 bg-white px-3 py-2 text-sm font-medium text-slate-900 outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-300/40";

function todayInput(): string {
  return new Date().toISOString().slice(0, 10);
}

export function OrderPaymentsPanel({
  orderId,
  canManage,
  onMutated,
}: {
  orderId: string;
  canManage: boolean;
  onMutated?: () => void;
}) {
  const { t, bcp47 } = useI18n();
  const tP = useCallback((key: string, vars?: Record<string, string | number>) => t(`orderPayments.${key}`, vars), [t]);
  const locale = bcp47 === "ar" ? "ar-IL" : bcp47 === "en" ? "en-GB" : "he-IL";

  const [payments, setPayments] = useState<OrderPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const [kind, setKind] = useState<OrderPaymentKind>("DEPOSIT");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<string>("CASH");
  const [paidAt, setPaidAt] = useState(todayInput);
  const [notes, setNotes] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/future-orders/${encodeURIComponent(orderId)}/payments`, {
        credentials: "same-origin",
        cache: "no-store",
      });
      const j = (await res.json()) as { ok?: boolean; data?: OrderPayment[]; error?: string };
      if (!res.ok || !j.ok) throw new Error(j.error ?? "err");
      setPayments(j.data ?? []);
    } catch {
      setError(tP("loadError"));
    } finally {
      setLoading(false);
    }
  }, [orderId, tP]);

  useEffect(() => {
    void load();
  }, [load]);

  const paidSoFar = useMemo(() => {
    let sum = 0;
    for (const p of payments) {
      if (p.status !== "ACTIVE") continue;
      const amt = Number(p.amount) || 0;
      sum += p.kind === "REFUND" ? -amt : amt;
    }
    return sum;
  }, [payments]);

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString(locale, { day: "2-digit", month: "short", year: "numeric" });

  const kindLabel = (k: string) =>
    k === "DEPOSIT" ? tP("kindDeposit") : k === "REFUND" ? tP("kindRefund") : tP("kindPayment");

  const addPayment = async () => {
    if (!canManage) return;
    const amt = Number(amount);
    if (!(amt > 0)) {
      setError(tP("invalidAmount"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/future-orders/${encodeURIComponent(orderId)}/payments`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: amt, kind, paymentMethod: method, paidAt, notes: notes.trim() || null }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) throw new Error(j.error ?? "err");
      setAmount("");
      setNotes("");
      await load();
      onMutated?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : tP("saveError"));
    } finally {
      setBusy(false);
    }
  };

  const cancelPayment = async (id: string) => {
    if (!canManage || !window.confirm(tP("confirmCancel"))) return;
    setCancellingId(id);
    setError(null);
    try {
      const res = await fetch(
        `/api/future-orders/${encodeURIComponent(orderId)}/payments/${encodeURIComponent(id)}`,
        { method: "DELETE", credentials: "same-origin" },
      );
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) throw new Error(j.error ?? "err");
      await load();
      onMutated?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : tP("saveError"));
    } finally {
      setCancellingId(null);
    }
  };

  return (
    <div className="rounded-xl border border-emerald-200/70 bg-emerald-50/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-black text-emerald-900">{tP("title")}</p>
        <span className="rounded-full border border-emerald-300/80 bg-white px-2.5 py-0.5 text-[11px] font-black text-emerald-800">
          {tP("paidSoFar")}: {formatShekel(paidSoFar)}
        </span>
      </div>
      <p className="mt-0.5 text-[11px] font-medium text-emerald-700/80">{tP("help")}</p>

      {error && (
        <p className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-800">
          {error}
        </p>
      )}

      <div className="mt-3 overflow-hidden rounded-lg border border-emerald-100 bg-white">
        {loading ? (
          <p className="px-3 py-3 text-center text-xs font-semibold text-slate-500">
            {t("common.loading")}
          </p>
        ) : payments.length === 0 ? (
          <p className="px-3 py-3 text-center text-xs font-semibold text-slate-500">{tP("none")}</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {payments.map((p) => {
              const cancelled = p.status !== "ACTIVE";
              const isRefund = p.kind === "REFUND";
              return (
                <li
                  key={p.id}
                  className={`flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm ${
                    cancelled ? "opacity-60" : ""
                  }`}
                >
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-black text-slate-700">
                      {kindLabel(p.kind)}
                    </span>
                    <span className="text-xs font-semibold text-slate-600">{fmtDate(p.paidAt)}</span>
                    {p.paymentMethod && (
                      <span className="text-xs font-medium text-slate-500">
                        {translatePaymentMethod(p.paymentMethod, t) ?? p.paymentMethod}
                      </span>
                    )}
                    {cancelled && (
                      <span className="rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-500 line-through">
                        {tP("statusCancelled")}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`font-black ${
                        cancelled ? "text-slate-400 line-through" : isRefund ? "text-rose-700" : "text-emerald-700"
                      }`}
                    >
                      {isRefund ? "−" : "+"}
                      {formatShekel(Number(p.amount) || 0)}
                    </span>
                    {canManage && !cancelled && (
                      <button
                        type="button"
                        onClick={() => void cancelPayment(p.id)}
                        disabled={cancellingId === p.id}
                        title={tP("cancelPayment")}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-rose-600 hover:bg-rose-50 disabled:opacity-40"
                      >
                        {cancellingId === p.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Ban className="h-3.5 w-3.5" />
                        )}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {canManage && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block">
            <span className="mb-1 block text-[11px] font-bold text-emerald-800">{tP("kind")}</span>
            <select
              className={inputClass}
              value={kind}
              onChange={(e) => setKind(e.target.value as OrderPaymentKind)}
            >
              {KIND_OPTIONS.map((k) => (
                <option key={k} value={k}>
                  {kindLabel(k)}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-bold text-emerald-800">{tP("amount")}</span>
            <input
              type="number"
              min={0}
              step="0.01"
              className={inputClass}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-bold text-emerald-800">{tP("method")}</span>
            <select
              className={inputClass}
              value={method}
              onChange={(e) => setMethod(e.target.value)}
            >
              {METHOD_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {translatePaymentMethod(m, t) ?? m}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-bold text-emerald-800">{tP("date")}</span>
            <input
              type="date"
              className={inputClass}
              value={paidAt}
              onChange={(e) => setPaidAt(e.target.value)}
            />
          </label>
          <label className="block sm:col-span-2 lg:col-span-3">
            <span className="mb-1 block text-[11px] font-bold text-emerald-800">{tP("notes")}</span>
            <input
              className={inputClass}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
          <div className="flex items-end">
            <button
              type="button"
              disabled={busy}
              onClick={() => void addPayment()}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-black text-white hover:bg-emerald-800 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {tP("add")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
