import { prisma } from "@/lib/prisma";

export type EmailMode = "important" | "critical_only" | "daily_digest" | "muted";

export type EmailPreferenceSnapshot = {
  emailMode: EmailMode;
  emailQuietHours: boolean;
  emailNotifyAll: boolean;
  emailNotifyTasks: boolean;
  emailNotifyLate: boolean;
  emailNotifyUpdates: boolean;
  inAppNotificationsEnabled: boolean;
  emailNotificationsEnabled: boolean;
};

const PREFS_TTL_MS = 30_000;
const prefsCache = new Map<string, { at: number; value: EmailPreferenceSnapshot }>();

export function invalidateUserEmailPreferences(userId: string): void {
  prefsCache.delete(userId);
}

const DEFAULTS: EmailPreferenceSnapshot = {
  emailMode: "important",
  emailQuietHours: true,
  emailNotifyAll: true,
  emailNotifyTasks: true,
  emailNotifyLate: true,
  emailNotifyUpdates: true,
  inAppNotificationsEnabled: true,
  emailNotificationsEnabled: true,
};

export async function getUserEmailPreferences(userId: string): Promise<EmailPreferenceSnapshot> {
  const cached = prefsCache.get(userId);
  if (cached && Date.now() - cached.at < PREFS_TTL_MS) return cached.value;
  try {
    const u = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        emailMode: true,
        emailQuietHours: true,
        emailNotifyAll: true,
        emailNotifyTasks: true,
        emailNotifyLate: true,
        emailNotifyUpdates: true,
        inAppNotificationsEnabled: true,
        emailNotificationsEnabled: true,
      },
    });
    if (!u) return DEFAULTS;
    const mode = (u.emailMode ?? "important") as EmailMode;
    const snapshot: EmailPreferenceSnapshot = {
      emailMode: ["important", "critical_only", "daily_digest", "muted"].includes(mode)
        ? mode
        : "important",
      emailQuietHours: u.emailQuietHours ?? true,
      emailNotifyAll: u.emailNotifyAll ?? true,
      emailNotifyTasks: u.emailNotifyTasks ?? true,
      emailNotifyLate: u.emailNotifyLate ?? true,
      emailNotifyUpdates: u.emailNotifyUpdates ?? true,
      inAppNotificationsEnabled: u.inAppNotificationsEnabled ?? true,
      emailNotificationsEnabled: u.emailNotificationsEnabled ?? true,
    };
    prefsCache.set(userId, { at: Date.now(), value: snapshot });
    return snapshot;
  } catch {
    return DEFAULTS;
  }
}

/** @deprecated — השתמש ב-shouldSendEmailForNotification מ-rules.ts */
export function shouldSendEmailForNotificationType(
  notificationType: string,
  prefs: EmailPreferenceSnapshot,
): boolean {
  if (prefs.emailMode === "muted") return false;
  if (!prefs.emailNotifyAll && prefs.emailMode === "important") return false;

  switch (notificationType) {
    case "TASK_ASSIGNED":
    case "TASK_COMPLETED":
      return prefs.emailNotifyTasks;
    case "SHIFT_LATE":
    case "CLOCK_IN_LATE":
      return prefs.emailNotifyLate;
    case "NEW_UPDATE":
      return prefs.emailNotifyUpdates;
    case "CHECK_DEPOSIT":
    case "FUTURE_ORDER":
    case "SYSTEM_ALERT":
      return true;
    default:
      return false;
  }
}
