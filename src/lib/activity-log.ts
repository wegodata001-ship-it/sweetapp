import { prisma } from "@/lib/prisma";

export async function logActivity(userId: string, action: string): Promise<void> {
  try {
    await prisma.activityLog.create({
      data: { userId, action },
    });
  } catch {
    // לא לשבור זרימה עיקרית
  }
}
