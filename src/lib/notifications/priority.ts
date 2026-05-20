export type NotificationPriorityLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

const PRIORITY_HEX: Record<NotificationPriorityLevel, string> = {
  LOW: "#94a3b8",
  MEDIUM: "#2563eb",
  HIGH: "#ea580c",
  CRITICAL: "#dc2626",
};

export function priorityToColor(priority: NotificationPriorityLevel | string | null | undefined): string {
  const p = String(priority ?? "MEDIUM").toUpperCase() as NotificationPriorityLevel;
  return PRIORITY_HEX[p] ?? PRIORITY_HEX.MEDIUM;
}

export function resolveNotificationColor(
  priority: NotificationPriorityLevel | string | null | undefined,
  explicitColor?: string | null,
): string {
  if (explicitColor?.trim()) return explicitColor.trim();
  return priorityToColor(priority);
}
