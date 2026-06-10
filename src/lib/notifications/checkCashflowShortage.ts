import { formatShekel } from "@/lib/format-shekel";
import { buildCashflowForecast } from "@/lib/finance/cashflow-forecast/build-forecast";
import { hasRecentNotification } from "@/lib/notifications/dedupe";
import { notifyAdminRecipients, toneToColor } from "@/lib/notifications/dispatch";
import { listStaffAlertRecipientIds } from "@/lib/staff/notify-managers";

function formatDateHe(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString("he-IL");
}

/** התראות על חוסר צפוי בתזרים — לא חוסם, רק מודיע */
export async function checkCashflowShortage(): Promise<number> {
  const { shortages } = await buildCashflowForecast();
  if (shortages.length === 0) return 0;

  const ids = await listStaffAlertRecipientIds();
  if (!ids.length) return 0;

  let sent = 0;
  for (const s of shortages) {
    const dup = await hasRecentNotification({
      type: "CASHFLOW_SHORTAGE",
      roleTarget: "ADMIN",
      metadataKey: "shortageDate",
      metadataValue: s.date,
      sinceHours: 24,
    });
    if (dup) continue;

    const dueLabel = formatDateHe(s.date);
    await notifyAdminRecipients(ids, {
      type: "CASHFLOW_SHORTAGE",
      title: `חוסר צפוי בתאריך ${dueLabel}`,
      message: `סכום חסר: ${formatShekel(s.shortageAmount)}`,
      color: toneToColor("DANGER"),
      priority: "HIGH",
      actionUrl: "/finance/cashflow-forecast",
      metadata: {
        source: "cashflow_forecast",
        shortageDate: s.date,
        balance: s.balance,
        shortageAmount: s.shortageAmount,
      },
      dedupe: { metadataKey: "shortageDate", sinceHours: 24 },
    });
    sent += 1;
  }
  return sent;
}

export async function syncCashflowShortageNotifications(): Promise<void> {
  await checkCashflowShortage();
}
