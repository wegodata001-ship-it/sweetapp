"use client";

import { Loader2, LogOut, PlayCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { useI18n } from "@/components/i18n-provider";
import { useToast } from "@/components/toast-provider";
import { WelcomeWorkdayOverlay } from "@/components/employee/welcome-workday-overlay";
import { EMPLOYEE_WORK_SESSION_STARTED_AT_KEY } from "@/lib/employee-experience/storage-keys";
import { getDayPeriod, GREETING_I18N_KEY } from "@/lib/employee-experience/greeting";
import { playEmployeeSound } from "@/lib/employee-experience/sounds";

/**
 * The big "Start your work day" screen.
 *
 * Rendered when an EMPLOYEE has no active WorkSession. Locks them out of the
 * rest of the app (the server-side guard in /employee/layout.tsx redirects
 * here whenever they try to navigate elsewhere). On successful clock-in we
 * push them to /employee.
 */
export function ClockInScreen() {
  const { t, dir, locale } = useI18n();
  const { showToast } = useToast();
  const { user } = useAuth();
  const router = useRouter();
  const [now, setNow] = useState<Date | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [welcomeOpen, setWelcomeOpen] = useState(false);

  useEffect(() => {
    queueMicrotask(() => setNow(new Date()));
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const bcp47 =
    locale === "ar" ? "ar-EG" : locale === "en" ? "en-US" : "he-IL";

  const clockText = now
    ? now.toLocaleTimeString(bcp47, {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      })
    : "--:--:--";
  const dateText = now
    ? now.toLocaleDateString(bcp47, {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "";

  async function startWorkDay() {
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/me/work-session/clock-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
        credentials: "same-origin",
      });
      const json = (await res.json().catch(() => null)) as
        | { ok: true; data: { id: string; clock_in: string } }
        | { ok: false; error?: string }
        | null;
      if (!json || !json.ok) {
        showToast({
          tone: "error",
          title: t("employee.clockScreen.errStart"),
          description: (json && !json.ok ? json.error : undefined) ?? "",
        });
        return;
      }
      try {
        sessionStorage.setItem(EMPLOYEE_WORK_SESSION_STARTED_AT_KEY, new Date().toISOString());
      } catch {
        /* יכול להיכשל במצב פרטי */
      }
      playEmployeeSound("start");
      showToast({
        tone: "success",
        title: t("employee.experience.workdayStartedToast"),
      });
      setWelcomeOpen(true);
    } finally {
      setSubmitting(false);
    }
  }

  async function signOut() {
    if (logoutBusy) return;
    setLogoutBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
      router.push("/login");
      router.refresh();
    } finally {
      setLogoutBusy(false);
    }
  }

  const displayName = user?.fullName?.trim() ?? "";
  const period = now ? getDayPeriod(now) : "morning";
  const timeGreeting = t(GREETING_I18N_KEY[period], {
    name: displayName || t("employee.experience.welcomeFallbackName"),
  });

  function closeWelcomeAndEnter() {
    setWelcomeOpen(false);
    router.push("/employee");
    router.refresh();
  }

  return (
    <div
      dir={dir}
      className="relative isolate flex min-h-[calc(100vh-2rem)] flex-col items-center justify-center px-4 py-10 sm:px-6 lg:px-8"
      style={{
        background:
          "radial-gradient(1100px 600px at 70% -10%, #dbeafe 0%, transparent 60%), radial-gradient(900px 500px at 10% 110%, #fef3c7 0%, transparent 55%), #f8fafc",
      }}
    >
      {welcomeOpen ? (
        <WelcomeWorkdayOverlay
          open
          fullName={user?.fullName?.trim() ?? ""}
          onClose={closeWelcomeAndEnter}
        />
      ) : null}
      <button
        type="button"
        onClick={() => void signOut()}
        disabled={logoutBusy}
        className="absolute right-4 top-4 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/90 px-3 py-1.5 text-xs font-bold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-white disabled:opacity-50 rtl:right-auto rtl:left-4"
      >
        <LogOut className="h-3.5 w-3.5" aria-hidden />
        {t("employee.clockScreen.signOut")}
      </button>

      <div className="w-full max-w-2xl">
        <div className="text-center">
          <p className="text-lg font-black text-[#2563eb]">{timeGreeting}</p>
          <p className="mt-1 text-sm font-semibold text-slate-500">{t("employee.experience.shiftWish")}</p>
          <h1 className="mt-3 font-mono text-6xl font-black tracking-tight text-slate-900 tabular-nums sm:text-7xl md:text-8xl">
            {clockText}
          </h1>
          <p className="mt-2 text-sm font-semibold text-slate-500">{dateText}</p>
        </div>

        <div className="mt-10 rounded-3xl border border-slate-200 bg-white/85 p-6 shadow-[0_30px_60px_-30px_rgba(15,23,42,0.25)] backdrop-blur sm:p-8">
          <p className="text-center text-base font-extrabold text-slate-900">
            {t("employee.clockScreen.notStarted")}
          </p>
          <p className="mt-1 text-center text-sm text-slate-500">
            {t("employee.clockScreen.notStartedHint")}
          </p>

          <button
            type="button"
            onClick={() => void startWorkDay()}
            disabled={submitting}
            className="mt-6 inline-flex w-full items-center justify-center gap-3 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 px-6 py-5 text-xl font-black text-white shadow-lg shadow-blue-600/25 transition hover:-translate-y-[1px] hover:from-blue-700 hover:to-indigo-700 disabled:cursor-not-allowed disabled:opacity-60 sm:text-2xl"
          >
            {submitting ? (
              <Loader2 className="h-7 w-7 animate-spin" aria-hidden />
            ) : (
              <PlayCircle className="h-8 w-8" aria-hidden />
            )}
            {t("employee.clockScreen.startBtn")}
          </button>
          <p className="mt-3 text-center text-xs font-semibold text-slate-400">
            {t("employee.clockScreen.startFooter")}
          </p>
        </div>
      </div>
    </div>
  );
}
