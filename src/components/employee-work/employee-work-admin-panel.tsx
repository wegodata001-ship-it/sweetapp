"use client";

import { Eraser, RefreshCw, Settings2, Square, Trash2 } from "lucide-react";
import { useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { ConfirmActionModal } from "@/components/employee-work/confirm-action-modal";

type ConfirmKind = "delete_groups" | "reset_day" | "clean_library" | "stop_timers" | null;

type Props = {
  employeeId: string | null;
  workDate: string;
  busy?: boolean;
  onAction: (action: string) => Promise<void>;
};

export function EmployeeWorkAdminPanel({ employeeId, workDate, busy, onAction }: Props) {
  const { t } = useI18n();
  const [confirm, setConfirm] = useState<ConfirmKind>(null);
  const [panelOpen, setPanelOpen] = useState(false);

  const run = async (action: string) => {
    await onAction(action);
    setConfirm(null);
  };

  const configs: Record<
    Exclude<ConfirmKind, null>,
    { title: string; body: string; hint?: string; confirm: string; tone: "danger" | "warning" | "primary"; icon: typeof Trash2 }
  > = {
    delete_groups: {
      title: t("workflows.employeeWork.admin.deleteGroupsTitle"),
      body: t("workflows.employeeWork.admin.deleteGroupsBody"),
      hint: t("workflows.employeeWork.admin.deleteGroupsHint"),
      confirm: t("common.delete"),
      tone: "danger",
      icon: Trash2,
    },
    reset_day: {
      title: t("workflows.employeeWork.admin.resetDayTitle"),
      body: t("workflows.employeeWork.admin.resetDayBody"),
      hint: t("workflows.employeeWork.admin.resetDayHint"),
      confirm: t("workflows.employeeWork.admin.resetDayConfirm"),
      tone: "warning",
      icon: RefreshCw,
    },
    clean_library: {
      title: t("workflows.employeeWork.admin.cleanLibTitle"),
      body: t("workflows.employeeWork.admin.cleanLibBody"),
      hint: t("workflows.employeeWork.admin.cleanLibHint"),
      confirm: t("workflows.employeeWork.admin.cleanLibConfirm"),
      tone: "primary",
      icon: Eraser,
    },
    stop_timers: {
      title: t("workflows.employeeWork.admin.stopTimersTitle"),
      body: t("workflows.employeeWork.admin.stopTimersBody"),
      confirm: t("workflows.employeeWork.admin.stopTimersConfirm"),
      tone: "warning",
      icon: Square,
    },
  };

  const active = confirm ? configs[confirm] : null;
  const actionMap: Record<Exclude<ConfirmKind, null>, string> = {
    delete_groups: "delete_all_groups",
    reset_day: "reset_day",
    clean_library: "clean_library",
    stop_timers: "stop_timers",
  };

  return (
    <div className="rounded-2xl bg-slate-900/95 p-2 text-white shadow-md ring-1 ring-slate-700">
      <button
        type="button"
        onClick={() => setPanelOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-xl px-2 py-2 text-xs font-black"
      >
        <span className="flex items-center gap-1.5">
          <Settings2 className="h-4 w-4" />
          {t("workflows.employeeWork.admin.panelTitle")}
        </span>
        <span className="text-[10px] text-slate-400">{panelOpen ? "▲" : "▼"}</span>
      </button>

      {panelOpen ? (
        <div className="mt-1 grid gap-1.5 sm:grid-cols-2">
          <AdminBtn
            icon={Trash2}
            label={t("workflows.employeeWork.admin.btnDeleteGroups")}
            disabled={!employeeId || busy}
            onClick={() => setConfirm("delete_groups")}
          />
          <AdminBtn
            icon={RefreshCw}
            label={t("workflows.employeeWork.admin.btnResetDay")}
            disabled={!employeeId || busy}
            onClick={() => setConfirm("reset_day")}
          />
          <AdminBtn
            icon={Eraser}
            label={t("workflows.employeeWork.admin.btnCleanLib")}
            disabled={busy}
            onClick={() => setConfirm("clean_library")}
          />
          <AdminBtn
            icon={Square}
            label={t("workflows.employeeWork.admin.btnStopTimers")}
            disabled={!employeeId || busy}
            onClick={() => setConfirm("stop_timers")}
          />
        </div>
      ) : null}

      {active && confirm ? (
        <ConfirmActionModal
          open
          title={active.title}
          body={active.body}
          hint={active.hint}
          confirmLabel={active.confirm}
          busy={busy}
          tone={active.tone}
          icon={active.icon}
          onCancel={() => setConfirm(null)}
          onConfirm={() => void run(actionMap[confirm])}
        />
      ) : null}
    </div>
  );
}

function AdminBtn({
  icon: Icon,
  label,
  disabled,
  onClick,
}: {
  icon: typeof Trash2;
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex min-h-[44px] items-center gap-2 rounded-xl bg-white/10 px-2.5 py-2 text-start text-[11px] font-black transition hover:bg-white/20 disabled:opacity-40"
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden />
      {label}
    </button>
  );
}
