"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { useI18n } from "@/components/i18n-provider";
import { LanguageSwitcher } from "@/components/language-switcher";

function passwordPolicyClientIssues(pw: string, t: (k: string) => string): string | null {
  if (pw.length < 8) return t("auth.errors.passwordTooShort");
  if (!/[A-Z]/.test(pw)) return t("auth.errors.passwordNoUppercase");
  if (!/\d/.test(pw)) return t("auth.errors.passwordNoDigit");
  return null;
}

export default function ChangePasswordPage() {
  const router = useRouter();
  const { t, dir } = useI18n();
  const { user, loading, refresh } = useAuth();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [show, setShow] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) return;
    if (!user.mustChangePassword) {
      const dest = user.role === "EMPLOYEE" ? "/employee/dashboard" : "/";
      router.replace(dest);
    }
  }, [loading, user, router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPassword !== confirmPassword) {
      setError(t("auth.errors.passwordMismatch"));
      return;
    }
    const local = passwordPolicyClientIssues(newPassword, t);
    if (local) {
      setError(local);
      return;
    }
    if (!user) return;
    setSubmitting(true);
    const roleAfter = user.role;
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword, confirmPassword }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        code?: string;
        message?: string;
        error?: string;
      };
      if (!res.ok || !j.ok) {
        setError(j.message || j.error || t("auth.errorChangePasswordFailed"));
        setSubmitting(false);
        return;
      }
      await refresh();
      const dest = roleAfter === "EMPLOYEE" ? "/employee/dashboard" : "/";
      router.replace(dest);
      router.refresh();
      setSubmitting(false);
    } catch {
      setError(t("auth.errorNetwork"));
      setSubmitting(false);
    }
  }

  if (loading || !user?.mustChangePassword) {
    return (
      <div
        className="flex min-h-screen items-center justify-center bg-gradient-to-br from-luxury-navy-rich via-luxury-navy-rich to-luxury-charcoal px-4"
        dir={dir}
      >
        <Loader2 className="h-10 w-10 animate-spin text-luxury-gold" aria-hidden />
      </div>
    );
  }

  return (
    <div
      className="relative flex min-h-[100dvh] items-center justify-center overflow-x-hidden bg-gradient-to-br from-luxury-navy-rich via-luxury-navy-rich to-luxury-charcoal px-4 py-10"
      dir={dir}
    >
      <div className="absolute end-4 top-4">
        <LanguageSwitcher guest />
      </div>

      <div className="app-panel w-full max-w-md p-6 shadow-luxury-sm sm:p-8">
        <div className="flex flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-luxury-gold/15 ring-1 ring-luxury-gold/30">
            <ShieldCheck className="h-7 w-7 text-luxury-gold" aria-hidden />
          </div>
          <p className="mt-3 text-xs font-bold tracking-[0.14em] text-luxury-gold">{t("meta.appTitle")}</p>
          <p className="mt-1 text-[11px] font-semibold text-slate-500">{t("meta.brandSubtitle")}</p>
          <h1 className="mt-4 text-2xl font-black text-slate-950 sm:text-3xl">{t("auth.forceChangeWelcomeTitle")}</h1>
          <p className="mt-2 text-sm font-semibold text-slate-600">{t("auth.forceChangeSubtitle")}</p>
        </div>

        <form onSubmit={(e) => void onSubmit(e)} className="mt-8 space-y-4">
          <div>
            <label className="mb-1.5 flex items-center gap-2 text-xs font-black text-slate-700">
              <KeyRound className="h-3.5 w-3.5 text-luxury-gold" aria-hidden />
              {t("auth.passwordNew")}
            </label>
            <input
              type={show ? "text" : "password"}
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
              className="min-h-[52px] w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base font-semibold text-slate-900 outline-none ring-luxury-gold/30 focus:border-luxury-gold focus:ring-2"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-black text-slate-700">{t("auth.passwordConfirm")}</label>
            <input
              type={show ? "text" : "password"}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
              className="min-h-[52px] w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base font-semibold text-slate-900 outline-none ring-luxury-gold/30 focus:border-luxury-gold focus:ring-2"
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
            <p className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-bold text-red-700">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={submitting}
            className="flex min-h-[54px] w-full items-center justify-center gap-2 rounded-2xl bg-luxury-gold px-5 text-base font-black text-luxury-charcoal shadow-sm disabled:opacity-60"
          >
            {submitting ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : null}
            {t("auth.saveNewPassword")}
          </button>
        </form>
      </div>
    </div>
  );
}
