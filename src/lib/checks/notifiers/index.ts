import { staffAlertNotifier } from "@/lib/checks/notifiers/staff-alert";
import {
  emailStubNotifier,
  smsStubNotifier,
  whatsappStubNotifier,
} from "@/lib/checks/notifiers/external-stubs";
import type { CheckAlertPayload, CheckNotifier } from "@/lib/checks/notifiers/types";

/** רשימת אפיקים בסדר עדיפות. רק מי שמוכן (isReady) יישלח. */
export const CHECK_NOTIFIERS: CheckNotifier[] = [
  staffAlertNotifier,
  emailStubNotifier,
  whatsappStubNotifier,
  smsStubNotifier,
];

/**
 * שולח התראה לכל הספקים שזמינים. מחזיר רשימת ערוצים שהצליחו.
 */
export async function dispatchCheckAlert(
  payload: CheckAlertPayload,
): Promise<string[]> {
  const succeeded: string[] = [];
  for (const n of CHECK_NOTIFIERS) {
    if (!n.isReady()) continue;
    try {
      const ok = await n.send(payload);
      if (ok) succeeded.push(n.channel);
    } catch {
      /* לא חוסם */
    }
  }
  return succeeded;
}
