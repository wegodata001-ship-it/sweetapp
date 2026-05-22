/** צבעי משימה — HEX */
export const TASK_COLOR_PRESETS = [
  { id: "urgent", hex: "#ef4444", labelKey: "workflows.employeeWork.colors.urgent" },
  { id: "wait", hex: "#eab308", labelKey: "workflows.employeeWork.colors.wait" },
  { id: "normal", hex: "#3b82f6", labelKey: "workflows.employeeWork.colors.normal" },
  { id: "done", hex: "#22c55e", labelKey: "workflows.employeeWork.colors.done" },
  { id: "kitchen", hex: "#a855f7", labelKey: "workflows.employeeWork.colors.kitchen" },
  { id: "pack", hex: "#f97316", labelKey: "workflows.employeeWork.colors.pack" },
] as const;

export type TaskAccentStyle = {
  borderInlineStartColor?: string;
  borderInlineStartWidth?: string;
  boxShadow?: string;
};

export function getTaskAccentStyle(color: string | null | undefined): TaskAccentStyle | undefined {
  if (!color) return undefined;
  return {
    borderInlineStartColor: color,
    borderInlineStartWidth: "4px",
    boxShadow: `0 0 12px ${color}33`,
  };
}
