"use client";

import { CheckCircle2, PartyPopper } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@/components/i18n-provider";
import { fireEmployeeConfetti } from "@/lib/employee-experience/confetti-burst";

export type TaskCelebrationVariant = "task" | "group";

type TaskCelebrationOverlayProps = {
  open: boolean;
  variant: TaskCelebrationVariant;
  completedEarly: boolean;
  onClose: () => void;
  autoCloseMs?: number;
};

const TASK_MSG_KEYS = [
  "employee.experience.celebrationTaskMsg0",
  "employee.experience.celebrationTaskMsg1",
  "employee.experience.celebrationTaskMsg2",
  "employee.experience.celebrationTaskMsg3",
  "employee.experience.celebrationTaskMsg4",
] as const;

export function TaskCelebrationOverlay({
  open,
  variant,
  completedEarly,
  onClose,
  autoCloseMs,
}: TaskCelebrationOverlayProps) {
  const { t, dir } = useI18n();
  const [mounted, setMounted] = useState(false);
  const [msgIndex, setMsgIndex] = useState(0);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  const dismiss = useCallback(() => {
    closeRef.current();
  }, []);

  const duration = autoCloseMs ?? (variant === "group" ? 4200 : 3200);

  useEffect(() => {
    queueMicrotask(() => setMounted(true));
  }, []);

  useEffect(() => {
    if (!open) return;
    setMsgIndex(Math.floor(Math.random() * TASK_MSG_KEYS.length));
    void fireEmployeeConfetti(variant === "group" ? "group" : "task");
    const id = window.setTimeout(() => dismiss(), duration);
    return () => window.clearTimeout(id);
  }, [open, variant, duration, dismiss]);

  if (!mounted || !open) return null;

  const Icon = variant === "group" ? PartyPopper : CheckCircle2;
  const subtitle =
    variant === "group"
      ? t("employee.experience.groupSubtitle")
      : t(TASK_MSG_KEYS[msgIndex]);
  const badge = completedEarly
    ? t("employee.experience.badgeEarly")
    : t("employee.experience.badgeOnTime");

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="task-celebration-title"
      dir={dir}
      className="fixed inset-0 z-[480] flex animate-in items-center justify-center bg-slate-900/30 p-4 fade-in duration-200 backdrop-blur-[1px]"
      onClick={() => dismiss()}
    >
      <div
        className="relative w-full max-w-sm animate-in rounded-3xl border border-emerald-200/80 bg-white p-7 text-center shadow-xl zoom-in-95 duration-200 md:max-w-md"
        style={{ boxShadow: "0 0 48px rgba(22, 163, 74, 0.15)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="pointer-events-none absolute inset-0 rounded-3xl opacity-60"
          style={{
            background: "radial-gradient(circle at 30% 0%, rgba(34,197,94,0.2), transparent 55%)",
          }}
        />
        <div className="relative">
          <div
            className={`mx-auto flex items-center justify-center rounded-2xl text-white shadow-md ${
              variant === "group" ? "h-16 w-16 bg-gradient-to-br from-emerald-500 to-blue-500" : "h-14 w-14 bg-[#16a34a]"
            }`}
          >
            <Icon className={variant === "group" ? "h-8 w-8" : "h-7 w-7"} aria-hidden />
          </div>
          {variant === "group" ? (
            <>
              <p className="mt-1 text-xs font-bold uppercase tracking-wider text-emerald-600">
                {t("employee.experience.groupProgress")}
              </p>
              <h2 id="task-celebration-title" className="mt-2 text-xl font-black text-slate-900 md:text-2xl">
                {t("employee.experience.groupTitle")}
              </h2>
            </>
          ) : (
            <h2 id="task-celebration-title" className="mt-5 text-xl font-black text-slate-900 md:text-2xl">
              {t("employee.experience.celebrationTitle")}
            </h2>
          )}
          <p className="mt-3 text-sm font-semibold leading-relaxed text-slate-600 md:text-base">{subtitle}</p>
          <span className="mt-5 inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-4 py-1.5 text-xs font-black text-emerald-800 md:text-sm">
            {badge}
          </span>
          <button
            type="button"
            onClick={() => dismiss()}
            className="mt-6 w-full rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
          >
            {t("common.close")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
