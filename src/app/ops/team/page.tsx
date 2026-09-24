"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import AdminWorkflowsPage from "@/app/admin/workflows/page";
import AdminStaffPage from "@/app/admin/staff/page";
import { WorkStatusBoard } from "@/components/work-status/work-status-board";
import { useAuth } from "@/components/auth-provider";
import { useI18n } from "@/components/i18n-provider";
import { OpsTabBar, type OpsTab } from "@/components/ops/ops-tab-bar";

function TeamHub() {
  const { t } = useI18n();
  const { user } = useAuth();
  const params = useSearchParams();
  const canTasks =
    user?.role === "SUPER_ADMIN" ||
    user?.role === "ADMIN" ||
    (user?.permissions ?? []).includes("tasks");

  const tabs: OpsTab[] = [
    { id: "tasks", label: t("ops.team.tabTasks"), href: "/ops/team?tab=tasks" },
    { id: "status", label: t("ops.team.tabStatus"), href: "/ops/team?tab=status" },
    { id: "attendance", label: t("ops.team.tabAttendance"), href: "/ops/team?tab=attendance" },
  ];
  const requested = params.get("tab");
  const active = tabs.some((tab) => tab.id === requested) ? requested! : "tasks";

  if (user && !canTasks) {
    return <p className="p-6 text-sm font-semibold text-slate-600">{t("ops.team.noAccess")}</p>;
  }

  return (
    <div className="mx-auto w-full max-w-[1480px] space-y-4 p-3 sm:p-5">
      <header>
        <h1 className="text-2xl font-black text-slate-950">{t("ops.team.title")}</h1>
        <p className="mt-1 text-sm text-slate-600">{t("ops.team.subtitle")}</p>
      </header>
      <OpsTabBar tabs={tabs} active={active} />
      {active === "tasks" ? <AdminWorkflowsPage /> : null}
      {active === "status" ? <WorkStatusBoard /> : null}
      {active === "attendance" ? <AdminStaffPage embedded /> : null}
    </div>
  );
}

export default function TeamPage() {
  return (
    <Suspense fallback={null}>
      <TeamHub />
    </Suspense>
  );
}
