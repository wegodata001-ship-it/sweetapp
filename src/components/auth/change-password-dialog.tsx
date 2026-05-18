"use client";

import { useEffect, useState } from "react";
import { KeyRound, Loader2, ShieldCheck, X } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";

type Props = {
  open: boolean;
  onClose: () => void;
  /** If true — cannot be dismissed (user must change a temporary password). */
  forced?: boolean;
  onSuccess?: () => void;
};

export function ChangePasswordDialog({ open, onClose, forced, onSuccess }: Props) {
  const { t, dir } = useI18n();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [show, setShow] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (open) return;
    queueMicrotask(() => {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setError(null);
      setDone(false);
      setSubmitting(false);
    });
  }, [open]);

  if (!open) return null;

  async function submit() {
    setError(null);
    if (newPassword.length < 8) {
      setError(t("auth.errors.passwordTooShort"));
      return;
    }
    if (!/[A-Z]/.test(newPassword)) {
      setError(t("auth.errors.passwordNoUppercase"));
      return;
    }
    if (!/\d/.test(newPassword)) {
      setError(t("auth.errors.passwordNoDigit"));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t("auth.errors.passwordMismatch"));
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/me/password", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: forced ? undefined : currentPassword,
          newPassword,
          confirmPassword,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        message?: string;
        code?: string;
      };
      if (!res.ok || !j.ok) {
        setError(j.message || j.error || t("auth.errorChangePasswordFailed"));
        setSubmitting(false);
        return;
      }
      setDone(true);
      setSubmitting(false);
      onSuccess?.();
    } catch {
      setError(t("auth.errorNetwork"));
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/70 p-3 sm:items-center"
      role="dialog"
      aria-modal="true"
      dir={dir}
    >
      <div className="w-full max-w-md rounded-3xl border-2 border-luxury-gold/40 bg-white p-5 shadow-luxury-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 text-luxury-navy-rich">
            <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-luxury-gold/15 ring-1 ring-luxury-gold/40">
              <KeyRound className="h-5 w-5 text-luxury-gold" aria-hidden />
            </span>
            <h3 className="text-lg font-black">{t("auth.changePasswordTitle")}</h3>
          </div>
          {forced ? null : (
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-1 text-slate-500 hover:bg-slate-100"
              aria-label={t("common.close")}
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
          )}
        </div>

        {forced ? (
          <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900">
            {t("auth.changePasswordForced")}
          </p>
        ) : (
          <p className="mt-2 text-xs text-slate-600">{t("auth.changePasswordHelp")}</p>
        )}

        {done ? (
          <div className="mt-5 flex flex-col items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-900">
            <ShieldCheck className="h-8 w-8" aria-hidden />
            <p className="text-base font-black">{t("auth.passwordChanged")}</p>
            <button
              type="button"
              onClick={onClose}
              className="mt-2 rounded-2xl bg-luxury-navy-rich px-5 py-2 text-sm font-black text-white"
            >
              {t("common.close")}
            </button>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
            className="mt-4 space-y-3"
          >
            {!forced ? (
              <div>
                <label className="mb-1 block text-xs font-black text-slate-700">
                  {t("auth.passwordCurrent")}
                </label>
                <input
                  type={show ? "text" : "password"}
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900"
                />
              </div>
            ) : null}

            <div>
              <label className="mb-1 block text-xs font-black text-slate-700">
                {t("auth.passwordNew")}
              </label>
              <input
                type={show ? "text" : "password"}
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={8}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-black text-slate-700">
                {t("auth.passwordConfirm")}
              </label>
              <input
                type={show ? "text" : "password"}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900"
              />
            </div>
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              className="text-[11px] font-bold text-luxury-gold hover:underline"
            >
              {show ? t("auth.hidePasswords") : t("auth.showPasswords")}
            </button>

            {error ? (
              <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">
                {error}
              </p>
            ) : null}

            <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
              {forced ? null : (
                <button
                  type="button"
                  onClick={onClose}
                  disabled={submitting}
                  className="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-black text-slate-700"
                >
                  {t("common.cancel")}
                </button>
              )}
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-luxury-gold px-5 py-2.5 text-sm font-black text-luxury-charcoal disabled:opacity-60"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                {t("auth.savePassword")}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
