"use client";

import Link from "next/link";
import {
  AlertTriangle,
  CalendarHeart,
  CheckCircle2,
  ClipboardList,
} from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import type { DashboardAlert } from "@/lib/dashboard/summary";

const SEVERITY_STYLES = {
  critical: "border-rose-200/90 bg-gradient-to-l from-rose-50 to-white text-rose-950",
  warning: "border-amber-200/90 bg-gradient-to-l from-amber-50 to-white text-amber-950",
  success: "border-emerald-200/90 bg-gradient-to-l from-emerald-50 to-white text-emerald-950",
  wedding: "border-fuchsia-200/90 bg-gradient-to-l from-pink-50 via-fuchsia-50/40 to-white text-fuchsia-950",
} as const;

function detailForAlert(alert: DashboardAlert, t: (k: string, p?: Record<string, string | number>) => string) {
  if (alert.detail === "ok" && alert.id === "inventory-ok") return t("dashboard.shortageOk");
  const params = alert.titleParams ?? {};
  if (alert.id === "late-employees") return t("dashboard.widgetLateEmployeesDetail", params);
  if (alert.id === "overdue-task-groups") return t("dashboard.widgetOverdueTasksDetail", params);
  if (alert.id === "pending-checks") return t("dashboard.widgetPendingChecksDetail", params);
  if (alert.id === "upcoming-orders") return t("dashboard.widgetUpcomingOrdersDetail", params);
  if (alert.id === "open-invoices") return t("dashboard.openInvoicesDetail", params);
  if (alert.id === "inventory-shortage") {
    return t("dashboard.redesign.shortageCount", { count: alert.detail });
  }
  return alert.detail;
}

export function AlertsPanel({ alerts }: { alerts: DashboardAlert[] }) {
  const { t } = useI18n();

  return (
    <section className="flex h-full min-h-[320px] flex-col rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
      <h2 className="erp-section-title">{t("dashboard.alertsTitle")}</h2>
      <div className="mt-3 flex flex-1 flex-col gap-2 overflow-y-auto pr-1">
        {alerts.length === 0 ? (
          <p className="rounded-2xl border border-slate-100 bg-slate-50 px-3 py-6 text-center text-sm font-semibold text-slate-500">
            {t("dashboard.redesign.noAlerts")}
          </p>
        ) : (
          alerts.map((alert) => {
            const style = SEVERITY_STYLES[alert.severity];
            const Icon =
              alert.severity === "success"
                ? CheckCircle2
                : alert.severity === "wedding"
                  ? CalendarHeart
                  : alert.severity === "critical"
                    ? AlertTriangle
                    : ClipboardList;
            const inner = (
              <>
                <p className="flex items-center gap-2 text-sm font-extrabold">
                  <Icon className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
                  {t(alert.titleKey, alert.titleParams)}
                </p>
                <p className="mt-1 text-[13px] font-semibold leading-snug opacity-90">
                  {detailForAlert(alert, t)}
                </p>
              </>
            );
            const className = `block rounded-2xl border px-3 py-2.5 transition hover:shadow-md ${style}`;
            return alert.href ? (
              <Link key={alert.id} href={alert.href} className={className}>
                {inner}
              </Link>
            ) : (
              <div key={alert.id} className={className}>
                {inner}
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
