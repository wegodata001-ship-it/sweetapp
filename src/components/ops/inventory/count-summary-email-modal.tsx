"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Mail, Send, X } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { useToast } from "@/components/toast-provider";
import type { SummaryPreset } from "@/lib/inventory/count-summary-range";

type Props = {
  open: boolean;
  onClose: () => void;
  initialPreset?: SummaryPreset;
  initialFrom?: string;
  initialTo?: string;
};

const PRESETS: SummaryPreset[] = ["today", "week", "month", "custom"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function CountSummaryEmailModal({
  open,
  onClose,
  initialPreset = "today",
  initialFrom = "",
  initialTo = "",
}: Props) {
  const { t, dir } = useI18n();
  const { showToast } = useToast();
  const tS = useCallback(
    (key: string, vars?: Record<string, string | number>) =>
      t(`ops.inventory.summary.${key}`, vars),
    [t],
  );

  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [preset, setPreset] = useState<SummaryPreset>(initialPreset);
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // כשנפתח החלון — מסתנכרן לתקופה שהמשתמש רואה כרגע בסיכום
  useEffect(() => {
    if (!open) return;
    setPreset(initialPreset);
    setFrom(initialFrom);
    setTo(initialTo);
    setError(null);
  }, [open, initialPreset, initialFrom, initialTo]);

  if (!open) return null;

  const rangeMissing = preset === "custom" && (!from || !to);
  const canSend = EMAIL_RE.test(email.trim()) && !rangeMissing && !sending;

  const submit = async () => {
    if (!canSend) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/inventory/count-summary/email", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: email.trim(),
          subject: subject.trim() || tS("defaultSubject"),
          preset,
          dateFrom: preset === "custom" ? from : undefined,
          dateTo: preset === "custom" ? to : undefined,
        }),
      });
      const j = (await res.json()) as {
        ok?: boolean;
        error?: string;
        data?: { queued: boolean; sessionCount: number };
      };
      if (!res.ok || !j.ok) {
        setError(j.error ?? tS("sendFailed"));
        return;
      }
      showToast({
        tone: "success",
        title: tS("sendQueued"),
        description: tS("sendQueuedDetail", { email: email.trim() }),
        durationMs: 5000,
      });
      setEmail("");
      setSubject("");
      onClose();
    } catch {
      setError(tS("sendFailed"));
    } finally {
      setSending(false);
    }
  };

  const inputClass =
    "h-12 w-full rounded-2xl border border-[#e7ecf5] bg-white px-3 text-sm font-semibold outline-none focus:border-[#6c4cff]";

  return (
    <div className="fixed inset-0 z-[240] flex items-end justify-center bg-slate-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div
        className="max-h-[92dvh] w-full overflow-y-auto overscroll-contain rounded-t-[22px] border border-[#e7ecf5] bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl sm:max-w-md sm:rounded-[22px]"
        role="dialog"
        aria-modal="true"
        dir={dir}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-[#6c4cff]" />
            <h3 className="text-base font-black text-slate-900">{tS("emailTitle")}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={sending}
            className="grid h-11 w-11 place-items-center rounded-xl text-slate-500 transition hover:bg-slate-100 disabled:opacity-40"
            aria-label={tS("close")}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <div>
            <label className="text-xs font-black text-slate-600" htmlFor="summary-email">
              {tS("emailAddress")}
            </label>
            <input
              id="summary-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void submit();
              }}
              placeholder="name@example.com"
              autoComplete="email"
              dir="ltr"
              className={`${inputClass} mt-1 text-start`}
            />
          </div>

          <div>
            <label className="text-xs font-black text-slate-600" htmlFor="summary-subject">
              {tS("emailSubject")}
            </label>
            <input
              id="summary-subject"
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={tS("defaultSubject")}
              className={`${inputClass} mt-1`}
            />
          </div>

          <div>
            <span className="text-xs font-black text-slate-600">{tS("emailPeriod")}</span>
            <div className="mt-1 flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPreset(p)}
                  className={`inline-flex h-9 items-center rounded-2xl border px-3 text-xs font-black transition ${
                    preset === p
                      ? "border-[#6c4cff] bg-[#6c4cff]/10 text-[#6c4cff]"
                      : "border-[#e7ecf5] bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {tS(`preset.${p}`)}
                </button>
              ))}
            </div>
            {preset === "custom" ? (
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="date"
                  value={from}
                  max={to || undefined}
                  onChange={(e) => setFrom(e.target.value)}
                  className={inputClass}
                  aria-label={tS("from")}
                />
                <span className="text-xs font-black text-slate-400">–</span>
                <input
                  type="date"
                  value={to}
                  min={from || undefined}
                  onChange={(e) => setTo(e.target.value)}
                  className={inputClass}
                  aria-label={tS("to")}
                />
              </div>
            ) : null}
          </div>

          <p className="rounded-2xl bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-500">
            {tS("attachmentsHint")}
          </p>

          {error ? (
            <p className="rounded-2xl border border-rose-100 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">
              {error}
            </p>
          ) : null}
        </div>

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={sending}
            className="h-11 flex-1 rounded-2xl border border-[#e7ecf5] bg-white text-sm font-black text-slate-700 transition hover:bg-slate-50 disabled:opacity-40"
          >
            {tS("cancel")}
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!canSend}
            className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-2xl text-sm font-black text-white shadow-md transition hover:brightness-110 disabled:opacity-40"
            style={{ background: "#6c4cff" }}
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            {sending ? tS("sending") : tS("send")}
          </button>
        </div>
      </div>
    </div>
  );
}
