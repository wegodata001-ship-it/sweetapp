"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";
import { useI18n } from "@/components/i18n-provider";
import { useToast } from "@/components/toast-provider";
import { MAX_SHIFT_MS } from "@/lib/work-sessions/max-shift";

type CurrentPayload = {
  ok?: boolean;
  data?: {
    auto_closed?: boolean;
    session?: { clock_in?: string } | null;
  };
};

/**
 * While an employee stays on a work screen, ask the server whether the
 * 12-hour shift has been closed. Redirects to the "day not started" screen.
 */
export function useAutoShiftGuard(enabled: boolean) {
  const router = useRouter();
  const { showToast } = useToast();
  const { t } = useI18n();
  const sawShift = useRef(false);
  const clockInMs = useRef<number | null>(null);
  const left = useRef(false);

  const check = useCallback(async () => {
    if (!enabled || left.current) return;
    const res = await fetch(`/api/me/work-session/current?_=${Date.now()}`, {
      credentials: "same-origin",
      cache: "no-store",
    });
    const json = (await res.json().catch(() => null)) as CurrentPayload | null;
    if (!json?.ok || left.current) return;
    const clockIn = json.data?.session?.clock_in;
    if (clockIn) {
      sawShift.current = true;
      clockInMs.current = new Date(clockIn).getTime();
      return;
    }
    const hitCap =
      clockInMs.current != null && Date.now() >= clockInMs.current + MAX_SHIFT_MS;
    if (!json.data?.auto_closed && !hitCap) return;
    left.current = true;
    showToast({ tone: "success", title: t("employee.dashboard.autoShiftEnded") });
    router.push("/employee/clock");
    router.refresh();
  }, [enabled, router, showToast, t]);

  useEffect(() => {
    if (!enabled) return;
    const kick = window.setTimeout(() => void check(), 0);
    const id = window.setInterval(() => void check(), 30_000);
    return () => {
      window.clearTimeout(kick);
      window.clearInterval(id);
    };
  }, [check, enabled]);
}
