import { prisma } from "@/lib/prisma";
import { hasRecentNotification } from "@/lib/notifications/dedupe";
import { notifyAdminRecipients, toneToColor } from "@/lib/notifications/dispatch";
import { listStaffAlertRecipientIds } from "@/lib/staff/notify-managers";
import { formatShekel } from "@/lib/format-shekel";

const SPIKE_RATIO = 1.5;
const MIN_SAMPLES = 3;

/** הוצאה חריגה — גבוהה מהממוצע לספק/קטגוריה */
export async function notifyAbnormalExpenseIfNeeded(params: {
  documentId: string;
  totalAmount: number;
  supplierId?: string | null;
  title: string;
}): Promise<boolean> {
  if (params.totalAmount <= 0) return false;

  const where = params.supplierId
    ? { supplierId: params.supplierId, category: "הוצאה" as const }
    : { category: "הוצאה" as const, title: params.title };

  const recent = await prisma.financialDocument.findMany({
    where: {
      ...where,
      id: { not: params.documentId },
      totalAmount: { gt: 0 },
    },
    select: { totalAmount: true },
    orderBy: { createdAt: "desc" },
    take: 12,
  });

  if (recent.length < MIN_SAMPLES) return false;

  const avg =
    recent.reduce((sum, row) => sum + row.totalAmount, 0) / Math.max(recent.length, 1);
  if (params.totalAmount < avg * SPIKE_RATIO) return false;

  const dup = await hasRecentNotification({
    type: "SYSTEM_ALERT",
    roleTarget: "ADMIN",
    metadataKey: "documentId",
    metadataValue: params.documentId,
    sinceHours: 168,
  });
  if (dup) return false;

  const adminIds = await listStaffAlertRecipientIds();
  if (!adminIds.length) return false;

  await notifyAdminRecipients(adminIds, {
    type: "SYSTEM_ALERT",
    title: "הוצאה חריגה",
    message: `${params.title}: ${formatShekel(params.totalAmount)} (ממוצע ${formatShekel(avg)})`,
    color: toneToColor("WARNING"),
    priority: "HIGH",
    actionUrl: `/finance/archive?doc=${params.documentId}`,
    metadata: {
      documentId: params.documentId,
      totalAmount: params.totalAmount,
      averageAmount: avg,
      systemAlert: true,
      alertKind: "ABNORMAL_EXPENSE",
      source: "abnormal_expense",
    },
  });
  return true;
}
