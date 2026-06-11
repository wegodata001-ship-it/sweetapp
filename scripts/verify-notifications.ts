/**
 * בדיקת כיסוי מערכת ההתראות — in-app + email + לוגים.
 * הרצה: npx tsx scripts/verify-notifications.ts
 */
import { resolveEmailImportance } from "../src/lib/email/importance";

type Channel = "in_app" | "email";

type Scenario = {
  id: string;
  type: string;
  channels: Channel[];
  producer: string;
  cron?: boolean;
};

const SCENARIOS: Scenario[] = [
  { id: "late_employee", type: "SHIFT_LATE", channels: ["in_app", "email"], producer: "checkLateEmployees + clock-in", cron: true },
  { id: "clock_in_late", type: "CLOCK_IN_LATE", channels: ["in_app", "email"], producer: "work-session/clock-in" },
  { id: "early_clock_out", type: "CLOCK_OUT", channels: ["in_app", "email"], producer: "work-session/clock-out" },
  { id: "missed_attendance", type: "MISSED_CLOCK_IN", channels: ["in_app", "email"], producer: "checkMissedAttendance", cron: true },
  { id: "missed_clock_out", type: "MISSED_CLOCK_OUT", channels: ["in_app", "email"], producer: "checkMissedAttendance", cron: true },
  { id: "task_assigned", type: "TASK_ASSIGNED", channels: ["in_app", "email"], producer: "task-flow.notifyTaskAssigned" },
  { id: "task_completed", type: "TASK_COMPLETED", channels: ["in_app", "email"], producer: "task-flow.notifyTaskCompleted" },
  { id: "task_overdue", type: "TASK_OVERDUE", channels: ["in_app", "email"], producer: "checkOverdueTasks + checkEmployeeOverdueTasks", cron: true },
  { id: "check_due_7d", type: "CHECK_DUE", channels: ["in_app", "email"], producer: "runDailyCheckNotifications", cron: true },
  { id: "check_bounced", type: "CHECK_BOUNCED", channels: ["in_app", "email"], producer: "checks/notifiers" },
  { id: "scan_success", type: "NEW_UPDATE", channels: ["in_app"], producer: "expenses/scan" },
  { id: "scan_failed", type: "SYSTEM_ALERT", channels: ["in_app", "email"], producer: "expenses/scan" },
  { id: "scan_unlinked", type: "SYSTEM_ALERT", channels: ["in_app", "email"], producer: "expenses/scan" },
  { id: "abnormal_expense", type: "SYSTEM_ALERT", channels: ["in_app", "email"], producer: "documents POST" },
  { id: "cashflow_shortage", type: "CASHFLOW_SHORTAGE", channels: ["in_app", "email"], producer: "checkCashflowShortage", cron: true },
  { id: "inventory_low", type: "INVENTORY_LOW", channels: ["in_app", "email"], producer: "checkInventoryLow", cron: true },
  { id: "overtime", type: "OVERTIME", channels: ["in_app", "email"], producer: "clock-out routes" },
  { id: "system_alert", type: "SYSTEM_ALERT", channels: ["in_app", "email"], producer: "notifySystemFailure" },
];

function emailEnabled(type: string, priority = "MEDIUM", metadata: Record<string, unknown> = {}): boolean {
  const importance = resolveEmailImportance({
    type,
    priority,
    roleTarget: "ADMIN",
    metadata,
  });
  return importance !== "NONE";
}

function printMatrix(): void {
  console.log("\n=== Notification coverage matrix ===\n");
  console.log("ID | Type | In-app | Email | Producer");
  console.log("---|------|--------|-------|--------");
  for (const s of SCENARIOS) {
    const meta =
      s.type === "INVENTORY_LOW"
        ? { outOfStock: true }
        : s.type === "NEW_UPDATE"
          ? { emailImportance: "NONE" }
          : s.type === "SYSTEM_ALERT"
            ? { systemAlert: true }
            : {};
    const email = s.channels.includes("email") && emailEnabled(s.type, "HIGH", meta);
    const inApp = s.channels.includes("in_app") ? "✓" : "—";
    const mail = email ? "✓" : "—";
    console.log(`${s.id} | ${s.type} | ${inApp} | ${mail} | ${s.producer}${s.cron ? " (cron)" : ""}`);
  }

  console.log("\n=== Audit log actions ===");
  console.log("NOTIFICATION_CREATED → ActivityLog (via logNotificationCreated)");
  console.log("EMAIL_NOTIFICATION_SENT → ActivityLog (via logEmailSent)");
  console.log("EMAIL_NOTIFICATION_FAILED → ActivityLog (via logEmailFailed)");
  console.log("\n=== Email status on Notification row ===");
  console.log("pending | sent | failed | skipped | queued");
  console.log("\n=== User preferences ===");
  console.log("inAppNotificationsEnabled | emailNotificationsEnabled | emailMode");
}

printMatrix();
