import type { Prisma } from "@prisma/client";
import { prismaAny } from "@/lib/prisma";
import { PERMISSION_KEYS } from "@/lib/auth/permissions";
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
  currentSessionId: true,
  permissions: { select: { permission: true } },
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
  currentSessionId: string | null;
  permissionStrings: string[];
};

function permissionStringsFor(role: string, rows: { permission: string }[]): string[] {
  if (role === "SUPER_ADMIN") return [...PERMISSION_KEYS];
  return rows.map((row) => row.permission);
}

function toLoginUser(row: {
  id: string;
  fullName: string;
  email: string;
  nationalId: string | null;
  phone: string | null;
  passwordHash: string;
  role: string;
  isActive: boolean;
  mustChangePassword: boolean;
  currentSessionId: string | null;
  permissions: { permission: string }[];
}): LoginUserRow {
  return {
    id: row.id,
    fullName: row.fullName,
    email: row.email,
    nationalId: row.nationalId,
    phone: row.phone,
    passwordHash: row.passwordHash,
    role: row.role,
    isActive: row.isActive,
    mustChangePassword: row.mustChangePassword,
    currentSessionId: row.currentSessionId,
    permissionStrings: permissionStringsFor(row.role, row.permissions),
  };
}

/** מוצא משתמש לפי אימייל, ת.ז. (כולל וריאציות), שם מלא, או טלפון — שאילתה אחת */
export async function resolveLoginUser(rawIdentifier: string): Promise<LoginUserRow | null> {
  const trimmed = rawIdentifier.trim();
  if (!trimmed) return null;

  const or: Prisma.UserWhereInput[] = [];
  if (looksLikeEmail(trimmed)) {
    or.push({ email: trimmed.toLowerCase() });
  }
  const nidVariants = nationalIdLookupVariants(trimmed);
  if (nidVariants.length > 0) {
    or.push({ nationalId: { in: nidVariants } });
  }
  const phoneDigits = normalizeNationalId(trimmed);
  if (phoneDigits.length >= 9) {
    or.push({ phone: trimmed }, { phone: { contains: phoneDigits } });
  }
  or.push({ fullName: { equals: trimmed, mode: "insensitive" } });

  const byUser = await prismaAny.user.findFirst({
    where: { OR: or },
    select: userSelect,
  });
  if (byUser) return toLoginUser(byUser as Parameters<typeof toLoginUser>[0]);

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
  if (linked) return toLoginUser(linked as Parameters<typeof toLoginUser>[0]);

  return null;
}
