"use client";

import { useEffect, useRef } from "react";
import type { UserRole } from "@prisma/client";
import { EMPLOYEE_WORK_SESSION_STARTED_AT_KEY, employeeMiddayToastKey } from "@/lib/employee-experience/storage-keys";

type ShowToast = (input: {
  tone?: "success" | "error" | "warning" | "info";
  title: string;
  durationMs?: number;
}) => string;

function localCalendarYmd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** טוסט מוטיבציה פעם אחת ביום אחרי 3 שעות עבודה — לא spam */
export function useEmployeeMiddayToast(params: {
  role: UserRole | undefined;
  userId: string | undefined;
  showToast: ShowToast;
  middayMessage: string;
}): void {
  const { role, userId, showToast, middayMessage } = params;
  const shownRef = useRef(false);

  useEffect(() => {
    if (role !== "EMPLOYEE" || !userId) return;
    if (typeof window === "undefined") return;

    const startedRaw = sessionStorage.getItem(EMPLOYEE_WORK_SESSION_STARTED_AT_KEY);
    if (!startedRaw) return;

    const ymd = localCalendarYmd();
    const storageKey = employeeMiddayToastKey(userId, ymd);
    if (localStorage.getItem(storageKey)) return;

    const started = new Date(startedRaw).getTime();
    if (!Number.isFinite(started)) return;

    const THREE_H = 3 * 60 * 60 * 1000;

    const maybeFire = () => {
      if (shownRef.current) return;
      if (Date.now() - started < THREE_H) return;
      shownRef.current = true;
      localStorage.setItem(storageKey, "1");
      showToast({
        tone: "success",
        title: middayMessage,
        durationMs: 5200,
      });
    };

    maybeFire();
    const id = window.setInterval(maybeFire, 60_000);
    return () => window.clearInterval(id);
  }, [role, userId, showToast, middayMessage]);
}
