import type { Prisma } from "@prisma/client";
import { prismaAny } from "@/lib/prisma";
import {
  looksLikeEmail,
  nationalIdLookupVariants,
  normalizeNationalId,
} from "@/lib/employees/national-id";

const userSelect = {
  id: true,
  fullName: true,
  email: true,
  nationalId: true,
  phone: true,
  passwordHash: true,
  role: true,
  isActive: true,
  mustChangePassword: true,
} as const;

export type LoginUserRow = {
  id: string;
  fullName: string;
  email: string;
  nationalId: string | null;
  phone: string | null;
  passwordHash: string;
  role: string;
  isActive: boolean;
  mustChangePassword: boolean;
};

/** מוצא משתמש לפי אימייל, ת.ז. (כולל וריאציות), שם מלא, או טלפון */
export async function resolveLoginUser(rawIdentifier: string): Promise<LoginUserRow | null> {
  const trimmed = rawIdentifier.trim();
  if (!trimmed) return null;

  if (looksLikeEmail(trimmed)) {
    const byEmail = await prismaAny.user.findFirst({
      where: { email: trimmed.toLowerCase() },
      select: userSelect,
    });
    if (byEmail) return byEmail as LoginUserRow;
  }

  const nidVariants = nationalIdLookupVariants(trimmed);
  if (nidVariants.length > 0) {
    const byNid = await prismaAny.user.findFirst({
      where: { nationalId: { in: nidVariants } },
      select: userSelect,
    });
    if (byNid) return byNid as LoginUserRow;
  }

  const phoneDigits = normalizeNationalId(trimmed);
  if (phoneDigits.length >= 9) {
    const byPhone = await prismaAny.user.findFirst({
      where: {
        OR: [
          { phone: trimmed },
          { phone: { contains: phoneDigits } },
        ],
      },
      select: userSelect,
    });
    if (byPhone) return byPhone as LoginUserRow;
  }

  const byName = await prismaAny.user.findFirst({
    where: {
      fullName: { equals: trimmed, mode: "insensitive" },
    },
    select: userSelect,
  });
  if (byName) return byName as LoginUserRow;

  /** עובד בכרטיס Employee בלי User — קישור דרך linkedUsers */
  const employee = await prismaAny.employee.findFirst({
    where: {
      OR: [
        { name: { equals: trimmed, mode: "insensitive" } },
        ...(phoneDigits.length >= 9
          ? [{ phone: { contains: phoneDigits } } as Prisma.EmployeeWhereInput]
          : []),
      ],
    },
    select: {
      linkedUsers: {
        take: 1,
        select: userSelect,
      },
    },
  });

  const linked = employee?.linkedUsers?.[0];
  if (linked) return linked as LoginUserRow;

  return null;
}
