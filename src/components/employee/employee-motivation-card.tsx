"use client";

import { Flame, PartyPopper, Sparkles, Target, ThumbsUp } from "lucide-react";
import {
  pickMotivationKind,
  type EmployeeTaskDayStats,
  type MotivationKind,
} from "@/lib/employee-experience/task-stats";
import { useI18n } from "@/components/i18n-provider";

const KIND_ICON: Record<MotivationKind, typeof Sparkles> = {
  doneMany: ThumbsUp,
  onTrack: Flame,
  almostDone: Target,
  start: Sparkles,
  allDone: PartyPopper,
};

const KIND_KEY: Record<MotivationKind, string> = {
  doneMany: "employee.experience.motivationDoneMany",
  onTrack: "employee.experience.motivationOnTrack",
  almostDone: "employee.experience.motivationAlmost",
  start: "employee.experience.motivationStart",
  allDone: "employee.experience.motivationAllDone",
};

type EmployeeMotivationCardProps = {
  stats: EmployeeTaskDayStats;
  className?: string;
};

export function EmployeeMotivationCard({ stats, className = "" }: EmployeeMotivationCardProps) {
  const { t } = useI18n();
  const kind = pickMotivationKind(stats);
  const Icon = KIND_ICON[kind];

  return (
    <div
      className={`flex items-center gap-3 rounded-2xl border border-emerald-200/80 bg-gradient-to-r from-emerald-50/90 to-white px-4 py-3 shadow-sm ${className}`}
      role="status"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#16a34a]/15 text-[#16a34a]">
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <p className="text-sm font-bold leading-snug text-slate-800">
        {t(KIND_KEY[kind], { count: stats.completed })}
      </p>
    </div>
  );
}
