"use client";

import { useI18n } from "@/components/i18n-provider";
import { TASK_COLOR_PRESETS } from "@/lib/work-tasks/task-color-presets";

export function TaskColorPicker({
  value,
  onChange,
  compact,
}: {
  value: string | null;
  onChange: (hex: string | null) => void;
  compact?: boolean;
}) {
  const { t } = useI18n();
  return (
    <div className={`flex flex-wrap gap-1 ${compact ? "" : "mt-1"}`}>
      <button
        type="button"
        title={t("workflows.employeeWork.colors.none")}
        onClick={() => onChange(null)}
        className={`h-7 w-7 rounded-full ring-2 ring-offset-1 ${
          !value ? "ring-slate-400" : "ring-transparent"
        } bg-slate-100`}
      />
      {TASK_COLOR_PRESETS.map((p) => (
        <button
          key={p.id}
          type="button"
          title={t(p.labelKey)}
          onClick={() => onChange(p.hex)}
          className={`h-7 w-7 rounded-full ring-2 ring-offset-1 transition ${
            value === p.hex ? "ring-slate-800 scale-110" : "ring-transparent hover:scale-105"
          }`}
          style={{ backgroundColor: p.hex }}
        />
      ))}
    </div>
  );
}
