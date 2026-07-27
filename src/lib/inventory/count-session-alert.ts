/**
 * התראת "סיום ספירת מלאי" לנמעני התראות המערכת.
 *
 * נשלחת ברקע אחרי שהספירה נשמרה, ולכן אינה מעכבת את המשתמש ואינה יכולה להפיל
 * את השמירה. הדוח היומי מהווה רשת ביטחון: גם אם שליחה בודדת נכשלה, הסיכום
 * היומי כולל את הספירה.
 */
import { prismaAny } from "@/lib/prisma";
import { getEmailConfig } from "@/lib/email/config";
import { logEmailError } from "@/lib/email/audit";
import { sendSystemAlertToRecipients } from "@/lib/notifications/system-alert-dispatch";
import { sessionDurationMinutes } from "@/lib/inventory/daily-count-report";

type SessionRow = {
  id: string;
  sessionNumber: number;
  locationName: string;
  startedAt: Date | null;
  createdAt: Date;
  productCount: number;
  matchCount: number;
  shortageCount: number;
  surplusCount: number;
  totalCountedQty: number;
  countedBy: { fullName: string } | null;
};

export async function sendCountSessionCompletedAlert(sessionId: string): Promise<void> {
  const session = (await prismaAny.inventoryCountSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      sessionNumber: true,
      locationName: true,
      startedAt: true,
      createdAt: true,
      productCount: true,
      matchCount: true,
      shortageCount: true,
      surplusCount: true,
      totalCountedQty: true,
      countedBy: { select: { fullName: true } },
    },
  })) as SessionRow | null;

  if (!session) return;

  const { appUrl } = getEmailConfig();
  const duration = sessionDurationMinutes(session.startedAt, session.createdAt);
  const location = session.locationName.trim() || "—";
  const countedBy = session.countedBy?.fullName?.trim() || "—";

  const lines = [
    `מיקום אחסון: ${location}`,
    `מספר ספירה: ${session.sessionNumber}`,
    `מבצע הספירה: ${countedBy}`,
    `שעת סיום: ${session.createdAt.toLocaleString("he-IL")}`,
    duration == null ? "משך הספירה: לא תועד" : `משך הספירה: ${duration} דק׳`,
    "",
    `מוצרים שנבדקו: ${session.productCount}`,
    `תקינים: ${session.matchCount}`,
    `חוסרים: ${session.shortageCount}`,
    `עודפים: ${session.surplusCount}`,
    `סה״כ יחידות שנספרו: ${session.totalCountedQty}`,
  ];

  await sendSystemAlertToRecipients({
    category: "inventoryCountCompleted",
    subject: `📦 הסתיימה ספירת מלאי — ${location} (#${session.sessionNumber})`,
    template: "system-alert",
    data: {
      appUrl,
      title: `הסתיימה ספירת מלאי — ${location}`,
      message: lines.join("\n"),
      actionUrl: `${appUrl}/ops/inventory`,
    },
    logType: "INVENTORY_COUNT_COMPLETED",
    entityId: session.id,
    dedupeKey: `count-session:${session.id}`,
    dedupeWindowHours: 24,
  });
}

/** קריאה מתוך route השמירה — לא ממתינה ולא זורקת */
export function scheduleCountSessionCompletedAlert(sessionId: string): void {
  void sendCountSessionCompletedAlert(sessionId).catch((e) => {
    logEmailError({ step: "count_session_alert", sessionId, error: String(e) });
  });
}
