"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { useI18n } from "@/components/i18n-provider";
import {
  WorkflowRunnerPage,
  type WorkflowEmployeeOption,
} from "@/components/workflows/workflow-runner-page";

/**
 * Admin → Workflows
 *
 * Monday/Notion/Kitchen-style live workflow runner. This is the new primary
 * "Tasks" page; the legacy `/admin/tasks` page stays available for backward
 * compatibility (and is also linked from this page header).
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
        setEmployees([]);
        setEmployeesError(
          res.status === 403
            ? t("admin.tasks.createForm.errLoadEmployeesForbidden")
            : t("admin.tasks.createForm.errLoadEmployees"),
        );
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
    <div dir={dir} className="mx-auto w-full max-w-[1480px] space-y-3 p-3 md:p-5">
      {employeesError ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900">
          {employeesError}
        </div>
      ) : null}

      <WorkflowRunnerPage employees={employees} canManage={canManage} />
    </div>
  );
}
