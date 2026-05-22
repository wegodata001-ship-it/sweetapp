"use client";

import {
  BarChart3,
  ChevronDown,
  ChevronUp,
  Loader2,
  Users,
} from "lucide-react";
import type { ReactNode, Ref } from "react";
import { useI18n } from "@/components/i18n-provider";
import { gradientForCard, gradientStyle, type CardGradient } from "./gradient-utils";
import { TaskProgressRing } from "./task-progress-ring";
import { TaskStatusPill, type TaskPillVariant } from "./task-status-pill";

export type TaskGroupCardStats = {
  total: number;
  open: number;
  completed: number;
  late: number;
  progressPct: number;
};

type Props = {
  id: string;
  title: string;
  emoji?: string;
  subtitle?: string;
  color?: string | null;
  gradientIndex?: number;
  stats: TaskGroupCardStats;
  statusVariant?: TaskPillVariant;
  statusLabel?: string;
  expanded: boolean;
  onToggleExpand: () => void;
  children?: ReactNode;
  footer?: ReactNode;
  headerExtra?: ReactNode;
  /** ⋮ menu — rendered outside expand toggle (manager templates only) */
  actionsMenu?: ReactNode;
  loading?: boolean;
  assigneeName?: string;
  cardRef?: Ref<HTMLLIElement>;
  removing?: boolean;
  highlight?: boolean;
};

/**
 * Main gradient card for a task group (template definition or live run).
 */
export function TaskGroupCard({
  title,
  emoji = "📋",
  subtitle,
  color,
  gradientIndex = 0,
  stats,
  statusVariant,
  statusLabel,
  expanded,
  onToggleExpand,
  children,
  footer,
  headerExtra,
  actionsMenu,
  loading,
  assigneeName,
  cardRef,
  removing = false,
  highlight = false,
}: Props) {
  const { t } = useI18n();
  const grad: CardGradient = gradientForCard(color, gradientIndex);

  return (
    <li
      ref={cardRef}
      className={`tcg-card group flex flex-col overflow-hidden rounded-2xl shadow-md transition duration-200 hover:scale-[1.02] hover:shadow-lg ${
        expanded ? "ring-2 ring-white/80" : ""
      } ${removing ? "tcg-card-exit pointer-events-none" : ""} ${
        highlight ? "tcg-card-enter ring-2 ring-violet-400/90" : ""
      }`}
      style={gradientStyle(grad)}
    >
      <div className="flex items-start gap-1 p-2 pb-0 sm:p-3 sm:pb-0">
        <button
          type="button"
          onClick={onToggleExpand}
          className="flex min-w-0 flex-1 flex-col gap-2 p-1 text-start sm:p-1.5"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-lg leading-none" aria-hidden>
                {emoji}
              </p>
              <h3 className="mt-1 line-clamp-2 text-sm font-black text-slate-900 sm:text-base">
                {title}
              </h3>
              {subtitle ? (
                <p className="mt-0.5 line-clamp-1 text-[10px] font-bold text-slate-800/80">{subtitle}</p>
              ) : null}
              {assigneeName ? (
                <p className="mt-1 flex items-center gap-1 text-[10px] font-bold text-slate-800/90">
                  <Users className="h-3 w-3 shrink-0" aria-hidden />
                  <span className="truncate">{assigneeName}</span>
                </p>
              ) : null}
            </div>
            <TaskProgressRing percent={stats.progressPct} accent={grad.accent} size={40} stroke={3} />
          </div>

          <div className="flex flex-wrap gap-1">
            <span className="rounded-lg bg-white/60 px-1.5 py-0.5 text-[9px] font-black text-slate-800">
              {t("workflows.cards.statTasks", { n: stats.total })}
            </span>
            <span className="rounded-lg bg-white/60 px-1.5 py-0.5 text-[9px] font-black text-slate-800">
              {t("workflows.cards.statDone", { n: stats.completed })}
            </span>
            {stats.late > 0 ? (
              <span className="rounded-lg bg-rose-600/90 px-1.5 py-0.5 text-[9px] font-black text-white">
                {t("workflows.cards.statLate", { n: stats.late })}
              </span>
            ) : null}
            {stats.open > 0 ? (
              <span className="rounded-lg bg-white/70 px-1.5 py-0.5 text-[9px] font-black text-slate-800">
                {t("workflows.cards.statOpen", { n: stats.open })}
              </span>
            ) : null}
          </div>

          <div className="flex items-center justify-between gap-2">
            {statusVariant && statusLabel ? (
              <TaskStatusPill variant={statusVariant} label={statusLabel} />
            ) : (
              <span />
            )}
            <span className="inline-flex items-center gap-0.5 text-[10px] font-black text-slate-800/90">
              {expanded ? (
                <>
                  <ChevronUp className="h-4 w-4" aria-hidden />
                  {t("workflows.cards.collapse")}
                </>
              ) : (
                <>
                  <ChevronDown className="h-4 w-4" aria-hidden />
                  {t("workflows.cards.expand")}
                </>
              )}
            </span>
          </div>
          {headerExtra}
        </button>
        {actionsMenu ? <div className="pt-1">{actionsMenu}</div> : null}
      </div>

      {expanded ? (
        <div className="tcg-fade-in border-t border-white/30 bg-black/5 px-2.5 pb-2.5 pt-2 sm:px-3">
          {loading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-slate-700" aria-hidden />
            </div>
          ) : (
            <>
              <ul className="max-h-[min(52vh,320px)] space-y-1.5 overflow-y-auto overscroll-contain pe-0.5">
                {children}
              </ul>
              {footer ? <div className="mt-2 space-y-1.5">{footer}</div> : null}
            </>
          )}
        </div>
      ) : null}
    </li>
  );
}

/** Footer action chip */
export function TaskGroupCardFooterAction({
  icon: Icon = BarChart3,
  label,
  onClick,
  primary,
}: {
  icon?: typeof BarChart3;
  label: string;
  onClick?: () => void;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center justify-center gap-1 rounded-xl py-2 text-[10px] font-black transition active:scale-[0.98] ${
        primary
          ? "bg-slate-900 text-white shadow-md hover:bg-slate-800"
          : "bg-white/75 text-slate-800 hover:bg-white"
      }`}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {label}
    </button>
  );
}
