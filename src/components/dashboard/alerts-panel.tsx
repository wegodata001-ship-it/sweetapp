"use client";

import Link from "next/link";
import {
  AlertTriangle,
  CalendarHeart,
  CheckCircle2,
  ClipboardList,
  Info,
} from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import type { DashboardAlert } from "@/lib/dashboard/summary";
import styles from "./alerts-panel.module.css";

const SEVERITY_CLASS = {
  critical: styles.critical,
  warning: styles.warning,
  success: styles.success,
  wedding: styles.wedding,
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
  if (alert.id.startsWith("wedding-") || alert.id.startsWith("order-soon")) {
    return alert.detail;
  }
  return alert.detail;
}

function alertIcon(alert: DashboardAlert) {
  if (alert.severity === "success") return CheckCircle2;
  if (alert.severity === "wedding") return CalendarHeart;
  if (alert.severity === "critical") return AlertTriangle;
  if (alert.id === "inventory-ok") return Info;
  return ClipboardList;
}

export function AlertsPanel({ alerts }: { alerts: DashboardAlert[] }) {
  const { t } = useI18n();

  return (
    <section className={styles.panel}>
      <h2 className={styles.title}>{t("dashboard.alertsTitle")}</h2>
      <div className={styles.list}>
        {alerts.length === 0 ? (
          <p className={styles.empty}>{t("dashboard.redesign.noAlerts")}</p>
        ) : (
          alerts.map((alert) => {
            const tone = SEVERITY_CLASS[alert.severity];
            const extra = alert.id === "inventory-ok" ? ` ${styles.info}` : "";
            const Icon = alertIcon(alert);
            const inner = (
              <>
                <p className={styles.alertTitle}>
                  <Icon className={styles.alertIcon} aria-hidden />
                  {t(alert.titleKey, alert.titleParams)}
                </p>
                <p className={styles.alertDetail}>{detailForAlert(alert, t)}</p>
              </>
            );
            const className = `${styles.alert} ${tone}${extra}`;
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
