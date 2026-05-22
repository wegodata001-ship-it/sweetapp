"use client";

import { Workflow } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { EmployeeWorkHub } from "@/components/employee-work/employee-work-hub";

/**
 * פורטל עובד — סדר העבודה היומי שלו (משימות + קבוצות שהוקצו).
 */
export function EmployeeWorkflowsClient() {
  const { t, dir } = useI18n();

  return (
    <div dir={dir} className="tcg-page mx-auto w-full max-w-3xl space-y-3 p-2 sm:p-4">
      <header className="px-0.5">
        <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-violet-800">
          <Workflow className="h-3.5 w-3.5" aria-hidden />
          {t("workflows.employee.kicker")}
        </p>
        <h1 className="text-lg font-black text-slate-950 sm:text-xl">{t("workflows.employeeWork.employeeTitle")}</h1>
        <p className="mt-0.5 text-xs text-slate-600">{t("workflows.employeeWork.employeeSubtitle")}</p>
      </header>

      <EmployeeWorkHub canManage={false} />
    </div>
  );
}
