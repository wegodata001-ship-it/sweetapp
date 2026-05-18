"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useState } from "react";
import { IdCard, KeyRound, ShieldCheck } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { useI18n } from "@/components/i18n-provider";
import { LanguageSwitcher } from "@/components/language-switcher";

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refresh, user, loading } = useAuth();
  const { t, dir } = useI18n();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const nextUrl = searchParams.get("next") || "/";

  useEffect(() => {
    if (!loading && user) {
      if (user.mustChangePassword) {
        router.replace("/change-password");
        return;
      }
      router.replace(nextUrl);
    }
  }, [loading, user, router, nextUrl]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ identifier: identifier.trim(), password }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error || t("auth.errorFailed"));
        setSubmitting(false);
        return;
      }
      await refresh();
      router.replace(nextUrl);
      router.refresh();
      setSubmitting(false);
    } catch {
      setError(t("auth.errorNetwork"));
      setSubmitting(false);
    }
  }

  return (
    <div
      className="relative flex min-h-screen items-center justify-center bg-gradient-to-br from-luxury-navy-rich via-luxury-navy-rich to-luxury-charcoal px-4 py-10"
      dir={dir}
    >
      <div className="absolute end-4 top-4">
        <LanguageSwitcher guest />
      </div>

      <div className="app-panel w-full max-w-md p-6 shadow-luxury-sm sm:p-8">
        <div className="flex items-center justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-luxury-gold/15 ring-1 ring-luxury-gold/30">
            <ShieldCheck className="h-7 w-7 text-luxury-gold" aria-hidden />
          </div>
        </div>
        <p className="mt-4 text-center text-xs font-bold tracking-[0.18em] text-luxury-gold">
          {t("meta.appTitle")}
        </p>
        <h1 className="mt-2 text-center text-2xl font-black text-slate-950 sm:text-3xl">
          {t("auth.loginTitle")}
        </h1>
        <p className="mt-2 text-center text-sm text-slate-600">{t("auth.loginSubtitle")}</p>

        <form onSubmit={(e) => void onSubmit(e)} className="mt-7 space-y-4">
          <div>
            <label htmlFor="identifier" className="mb-1 block text-xs font-black text-slate-700">
              {t("auth.identifier")}
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 end-3 flex items-center text-slate-400">
                <IdCard className="h-5 w-5" aria-hidden />
              </span>
              <input
                id="identifier"
                type="text"
                inputMode="text"
                autoComplete="username"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder={t("auth.identifierPlaceholder")}
                dir="auto"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 pe-11 text-base font-bold text-slate-900 outline-none ring-luxury-gold/30 focus:ring-2"
                required
              />
            </div>
          </div>

          <div>
            <label htmlFor="password" className="mb-1 block text-xs font-black text-slate-700">
              {t("auth.password")}
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 end-3 flex items-center text-slate-400">
                <KeyRound className="h-5 w-5" aria-hidden />
              </span>
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 pe-11 text-base font-bold text-slate-900 outline-none ring-luxury-gold/30 focus:ring-2"
                required
              />
            </div>
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="mt-1 text-[11px] font-bold text-luxury-gold hover:underline"
            >
              {showPassword ? t("auth.hidePassword") : t("auth.showPassword")}
            </button>
          </div>

          {error ? (
            <p
              className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700"
              role="alert"
            >
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={submitting || !identifier.trim() || !password}
            className="w-full rounded-2xl bg-luxury-gold px-5 py-3.5 text-base font-black text-luxury-charcoal shadow-luxury-sm transition hover:bg-luxury-gold-hover disabled:opacity-60"
          >
            {submitting ? t("auth.submitting") : t("auth.submit")}
          </button>
        </form>

        <p className="mt-5 text-center text-[11px] text-slate-500">{t("auth.needHelp")}</p>

        <p className="mt-4 text-center text-xs text-slate-500">
          <Link href="/" className="font-semibold text-luxury-gold hover:underline">
            {t("auth.backHome")}
          </Link>
        </p>
      </div>
    </div>
  );
}

function LoginFallback() {
  const { t } = useI18n();
  return (
    <div className="flex min-h-screen items-center justify-center bg-luxury-navy-rich px-4 py-12">
      <p className="text-sm font-semibold text-slate-300">{t("common.loading")}</p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginContent />
    </Suspense>
  );
}
