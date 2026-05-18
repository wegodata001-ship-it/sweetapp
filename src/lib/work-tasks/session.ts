import { prisma } from "@/lib/prisma";

/** לכל היותר משמרת משימות אחת פתוחה לכל כרטיס עובד */
export async function getOrCreateActiveEmployeeWorkSession(employeeId: string) {
  const open = await prisma.employeeWorkSession.findFirst({
    where: { employeeId, status: "ACTIVE" },
    orderBy: { startedAt: "desc" },
  });
  if (open) return open;
  return prisma.employeeWorkSession.create({
    data: { employeeId, status: "ACTIVE" },
  });
}
