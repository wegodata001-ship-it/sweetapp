import { prisma } from "@/lib/prisma";
import { hasRecentNotification } from "@/lib/notifications/dedupe";
import { notifyAdminRecipients, toneToColor } from "@/lib/notifications/dispatch";
import { listStaffAlertRecipientIds } from "@/lib/staff/notify-managers";

/** התראות מלאי — מתחת למינימום / אזל */
export async function checkInventoryLow(): Promise<number> {
  const products = await prisma.product.findMany({
    select: {
      id: true,
      name: true,
      currentStock: true,
      minStock: true,
    },
    take: 500,
  });

  const lowProducts = products.filter((p) => p.currentStock <= p.minStock);
  if (!lowProducts.length) return 0;

  const adminIds = await listStaffAlertRecipientIds();
  if (!adminIds.length) return 0;

  let sent = 0;
  for (const p of lowProducts) {
    const outOfStock = p.currentStock <= 0;
    const dup = await hasRecentNotification({
      type: "INVENTORY_LOW",
      roleTarget: "ADMIN",
      metadataKey: "productId",
      metadataValue: p.id,
      sinceHours: 24,
    });
    if (dup) continue;

    await notifyAdminRecipients(adminIds, {
      type: "INVENTORY_LOW",
      title: outOfStock ? `מלאי אזל — ${p.name}` : `מלאי נמוך — ${p.name}`,
      message: outOfStock
        ? `הפריט "${p.name}" אזל מהמלאי`
        : `יתרה ${p.currentStock} (מינימום ${p.minStock})`,
      color: toneToColor(outOfStock ? "DANGER" : "WARNING"),
      priority: outOfStock ? "CRITICAL" : "HIGH",
      actionUrl: "/inventory",
      metadata: {
        productId: p.id,
        currentStock: p.currentStock,
        minStock: p.minStock,
        outOfStock,
        source: "inventory_low_check",
      },
    });
    sent += 1;
  }
  return sent;
}
