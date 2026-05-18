"use client";

import type { ReactNode } from "react";
import { useMemo } from "react";
import { getDayPeriod, GREETING_I18N_KEY } from "@/lib/employee-experience/greeting";
import { useI18n } from "@/components/i18n-provider";

type EmployeeGreetingHeaderProps = {
  name: string;
  subtitle?: string;
  className?: string;
  action?: ReactNode;
};

export function EmployeeGreetingHeader({
  name,
  subtitle,
  className = "",
  action,
}: EmployeeGreetingHeaderProps) {
  const { t } = useI18n();
  const period = useMemo(() => getDayPeriod(), []);
  const greetingKey = GREETING_I18N_KEY[period];
  const displayName = name.trim() || t("employee.experience.welcomeFallbackName");

  return (
    <header className={`flex flex-wrap items-start justify-between gap-3 ${className}`}>
      <div className="min-w-0 flex-1">
        <h1 className="text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
          {t(greetingKey, { name: displayName })}
        </h1>
        <p className="mt-1.5 text-sm font-semibold text-slate-600">
          {subtitle ?? t("employee.experience.shiftWish")}
        </p>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}
