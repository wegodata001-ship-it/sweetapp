"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { useI18n } from "@/components/i18n-provider";
import { EmployeeWorkHub } from "@/components/employee-work/employee-work-hub";
import type { WorkflowEmployeeOption } from "@/components/tasks/cards/workflow-types";

/**
 * משימות לעובדים + סדר עבודה יומי — מסך מאוחד.
 */
export default function AdminWorkflowsPage() {
  const { t, dir } = useI18n();
  const { user } = useAuth();
  const [employees, setEmployees] = useState<WorkflowEmployeeOption[]>([]);
  const [employeesError, setEmployeesError] = useState<string | null>(null);
  const canManage =
    user?.role === "SUPER_ADMIN" ||
    user?.role === "ADMIN" ||
    (user?.permissions ?? []).includes("tasks");

  const loadEmployees = useCallback(async () => {
    if (!canManage) {
      setEmployees([]);
      return;
    }
    setEmployeesError(null);
    try {
      const res = await fetch("/api/employees?forTasks=1", { credentials: "same-origin" });
      if (!res.ok) {
        setEmployeesError(t("admin.tasks.createForm.errLoadEmployees"));
        return;
      }
      const json = (await res.json().catch(() => null)) as
        | { data?: WorkflowEmployeeOption[]; employees?: WorkflowEmployeeOption[] }
        | null;
      const list = json?.data ?? json?.employees ?? [];
      setEmployees(Array.isArray(list) ? list : []);
    } catch (e) {
      setEmployeesError(
        e instanceof Error ? e.message : t("admin.tasks.createForm.errLoadEmployees"),
      );
      setEmployees([]);
    }
  }, [canManage, t]);

  useEffect(() => {
    queueMicrotask(() => {
      void loadEmployees();
    });
  }, [loadEmployees]);

  return (
    <div dir={dir} className="tcg-page mx-auto w-full max-w-[1480px] space-y-3 p-2 sm:p-4 md:p-5">
      <header className="px-0.5">
        <p className="text-[10px] font-black uppercase tracking-wider text-violet-800">
          {t("workflows.page.kicker")}
        </p>
        <h1 className="text-xl font-black text-slate-950 sm:text-2xl">
          {t("workflows.page.hub.pageTitle")}
        </h1>
        <p className="mt-0.5 text-sm text-slate-600">{t("workflows.employeeWork.pageSubtitle")}</p>
      </header>

      {employeesError ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900">
          {employeesError}
        </div>
      ) : null}

      <EmployeeWorkHub
        employees={employees}
        canManage={canManage}
        isSuperAdmin={user?.role === "SUPER_ADMIN"}
      />
    </div>
  );
}
