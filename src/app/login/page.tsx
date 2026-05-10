"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refresh, user, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const nextUrl = searchParams.get("next") || "/";

  useEffect(() => {
    if (!loading && user) {
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
        body: JSON.stringify({ email, password }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error || "התחברות נכשלה");
        setSubmitting(false);
        return;
      }
      await refresh();
      router.replace(nextUrl);
      router.refresh();
      setSubmitting(false);
    } catch {
      setError("שגיאת רשת");
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-luxury-navy-rich px-4 py-12">
      <div className="app-panel w-full max-w-md p-8 shadow-luxury-sm">
        <p className="text-sm font-bold tracking-[0.14em] text-luxury-gold">WEGO BUSINESS</p>
        <h1 className="mt-3 text-2xl font-black text-slate-950">כניסה למערכת</h1>
        <p className="mt-2 text-sm text-slate-600">הזינו אימייל וסיסמה.</p>

        <form onSubmit={(e) => void onSubmit(e)} className="mt-8 space-y-4">
          <div>
            <label htmlFor="email" className="mb-1 block text-xs font-bold text-slate-600">
              אימייל
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none ring-luxury-gold/30 focus:ring-2"
              required
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block text-xs font-bold text-slate-600">
              סיסמה
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none ring-luxury-gold/30 focus:ring-2"
              required
            />
          </div>

          {error ? (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p>
          ) : null}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-full bg-luxury-gold px-5 py-3 text-sm font-bold text-luxury-charcoal shadow-luxury-sm transition hover:bg-luxury-gold-hover disabled:opacity-60"
          >
            {submitting ? "מתחבר…" : "התחברות"}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-slate-500">
          <Link href="/" className="font-semibold text-luxury-gold hover:underline">
            חזרה לדף הבית
          </Link>
        </p>
      </div>
    </div>
  );
}

function LoginFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-luxury-navy-rich px-4 py-12">
      <p className="text-sm font-semibold text-slate-300">טוען…</p>
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
