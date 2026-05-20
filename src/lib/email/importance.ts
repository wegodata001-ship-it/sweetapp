import type { NotificationPriorityLevel } from "@/lib/notifications/priority";

export type EmailImportance = "NONE" | "LOW" | "NORMAL" | "HIGH" | "CRITICAL";

const RANK: Record<EmailImportance, number> = {
  NONE: 0,
  LOW: 1,
  NORMAL: 2,
  HIGH: 3,
  CRITICAL: 4,
};

export function emailImportanceMeetsThreshold(
  importance: EmailImportance,
  min: EmailImportance = "NORMAL",
): boolean {
  return RANK[importance] >= RANK[min];
}

export function resolveEmailImportance(params: {
  type: string;
  priority?: NotificationPriorityLevel | string | null;
  roleTarget: "ADMIN" | "EMPLOYEE" | "BOTH";
  metadata?: Record<string, unknown> | null;
}): EmailImportance {
  const m = params.metadata ?? {};
  const explicit = m.emailImportance;
  if (
    explicit === "NONE" ||
    explicit === "LOW" ||
    explicit === "NORMAL" ||
    explicit === "HIGH" ||
    explicit === "CRITICAL"
  ) {
    return explicit;
  }

  if (m.requiresManagerApproval === true) return "HIGH";
  if (m.importantUpdate === true) return "HIGH";
  if (m.personalMessage === true) return "NORMAL";

  const p = String(params.priority ?? "MEDIUM").toUpperCase();

  switch (params.type) {
    case "TASK_ASSIGNED":
      return "NORMAL";
    case "TASK_COMPLETED":
    case "CHECK_DEPOSIT":
    case "FUTURE_ORDER":
      if (p === "CRITICAL") return "CRITICAL";
      if (p === "HIGH") return "HIGH";
      return "NORMAL";
    case "SHIFT_LATE":
    case "CLOCK_IN_LATE":
      if (p === "CRITICAL" || p === "HIGH") return "HIGH";
      return "NORMAL";
    case "TASK_OVERDUE":
    case "TASK_LATE":
    case "TASK_STARTED":
    case "TASK_GROUP_COMPLETED":
      return p === "HIGH" || p === "CRITICAL" ? "HIGH" : "NORMAL";
    case "SYSTEM_ALERT":
      if (p === "CRITICAL") return "CRITICAL";
      if (p === "HIGH") return "HIGH";
      return "NORMAL";
    case "NEW_UPDATE":
      return m.importantUpdate === true ? "HIGH" : "LOW";
    case "MISSED_CLOCK_IN":
      return params.roleTarget === "ADMIN" ? "NORMAL" : "NONE";
    default:
      return "NONE";
  }
}
