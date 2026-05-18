"use client";

import { PartyPopper } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";

export function EmployeeEmptyTasks({ className = "" }: { className?: string }) {
  const { t } = useI18n();

  return (
    <div
      className={`flex flex-col items-center gap-4 rounded-3xl border border-dashed border-emerald-200 bg-gradient-to-br from-emerald-50/50 to-white px-6 py-16 text-center ${className}`}
    >
      <PartyPopper className="h-16 w-16 text-[#16a34a]" aria-hidden />
      <p className="text-xl font-black text-slate-900">{t("employee.experience.emptyTasksTitle")}</p>
      <p className="max-w-xs text-sm font-semibold text-slate-600">{t("employee.experience.emptyTasksHint")}</p>
    </div>
  );
}
