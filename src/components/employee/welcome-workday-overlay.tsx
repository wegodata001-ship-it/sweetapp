"use client";

import { Sparkles } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@/components/i18n-provider";
import { fireEmployeeConfetti } from "@/lib/employee-experience/confetti-burst";
import { getDayPeriod, GREETING_I18N_KEY } from "@/lib/employee-experience/greeting";

type WelcomeWorkdayOverlayProps = {
  open: boolean;
  fullName: string;
  onClose: () => void;
  autoCloseMs?: number;
};

const WELCOME_KEYS = [
  "employee.experience.welcomeMsg0",
  "employee.experience.welcomeMsg1",
  "employee.experience.welcomeMsg2",
  "employee.experience.welcomeMsg3",
  "employee.experience.welcomeMsg4",
] as const;

export function WelcomeWorkdayOverlay({
  open,
  fullName,
  onClose,
  autoCloseMs = 2600,
}: WelcomeWorkdayOverlayProps) {
  const { t, dir, locale } = useI18n();
  const [mounted, setMounted] = useState(false);
  const [msgIndex, setMsgIndex] = useState(0);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  const bcp47 = locale === "ar" ? "ar-EG" : locale === "en" ? "en-US" : "he-IL";

  useEffect(() => {
    queueMicrotask(() => setMounted(true));
  }, []);

  const dismiss = useCallback(() => {
    closeRef.current();
  }, []);

  useEffect(() => {
    if (!open) return;
    setMsgIndex(Math.floor(Math.random() * WELCOME_KEYS.length));
    void fireEmployeeConfetti("welcome");
    const id = window.setTimeout(() => dismiss(), autoCloseMs);
    return () => window.clearTimeout(id);
  }, [open, autoCloseMs, dismiss]);

  if (!mounted || !open) return null;

  const now = new Date();
  const timeStr = now.toLocaleTimeString(bcp47, { hour: "2-digit", minute: "2-digit", hour12: false });
  const dateStr = now.toLocaleDateString(bcp47, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const displayName = fullName.trim() || t("employee.experience.welcomeFallbackName");
  const line = t(WELCOME_KEYS[msgIndex]);
  const period = getDayPeriod(now);
  const greetingLine = t(GREETING_I18N_KEY[period], { name: displayName });

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-workday-title"
      dir={dir}
      className="fixed inset-0 z-[500] flex animate-in items-center justify-center bg-slate-900/35 p-4 fade-in duration-300 backdrop-blur-[2px]"
      onClick={() => dismiss()}
    >
      <div
        className="relative w-full max-w-md animate-in overflow-hidden rounded-3xl border border-white/30 bg-white/95 p-8 text-center shadow-2xl zoom-in-95 duration-300"
        style={{
          boxShadow: "0 0 60px rgba(34, 197, 94, 0.12), 0 25px 50px -12px rgba(15, 23, 42, 0.25)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="pointer-events-none absolute -inset-px rounded-3xl opacity-90"
          style={{
            background:
              "linear-gradient(135deg, rgba(34,197,94,0.12) 0%, rgba(59,130,246,0.1) 45%, rgba(250,204,21,0.08) 100%)",
          }}
        />
        <div className="relative">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-sky-500 text-white shadow-lg">
            <Sparkles className="h-7 w-7" aria-hidden />
          </div>
          <h2 id="welcome-workday-title" className="mt-5 text-xl font-black text-slate-900 md:text-2xl">
            {greetingLine}
          </h2>
          <p className="mt-2 text-sm font-semibold text-emerald-700">{t("employee.experience.shiftWish")}</p>
          <p className="mt-1 text-sm font-semibold text-slate-500">{dateStr}</p>
          <p className="mt-1 font-mono text-lg font-bold text-slate-700 tabular-nums" dir="ltr">
            {timeStr}
          </p>
          <p className="mt-5 text-base font-semibold leading-relaxed text-slate-700">{line}</p>
          <button
            type="button"
            onClick={() => dismiss()}
            className="mt-8 w-full rounded-2xl bg-gradient-to-r from-emerald-600 to-sky-600 px-4 py-3.5 text-sm font-black text-white shadow-md transition hover:brightness-105 active:scale-[0.99]"
          >
            {t("employee.experience.welcomeStartBtn")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
