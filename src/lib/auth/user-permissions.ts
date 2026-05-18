import type { UserRole } from "@prisma/client";
import { prismaAny } from "@/lib/prisma";
import { PERMISSION_KEYS } from "@/lib/auth/permissions";

export async function getPermissionStringsForUser(userId: string, role: UserRole): Promise<string[]> {
  if (role === "SUPER_ADMIN") {
    return [...PERMISSION_KEYS];
  }
  const rows = (await prismaAny.userPermission.findMany({
    where: { userId },
    select: { permission: true },
  })) as { permission: string }[];
  return rows.map((r) => r.permission);
}
