import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { UserRole } from "@prisma/client";

let usersKnownToExist = false;

/** יוצר SUPER_ADMIN ראשון מ-SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD אם אין משתמשים */
export async function ensureBootstrapSuperAdmin(): Promise<boolean> {
  if (usersKnownToExist) return false;
  const count = await prisma.user.count();
  if (count > 0) {
    usersKnownToExist = true;
    return false;
  }

  const email = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SUPER_ADMIN_PASSWORD;
  if (!email || !password) return false;

  const passwordHash = await hashPassword(password);
  await prisma.user.create({
    data: {
      fullName: "Super Admin",
      email,
      passwordHash,
      role: UserRole.SUPER_ADMIN,
      isActive: true,
      mustChangePassword: false,
    },
  });
  usersKnownToExist = true;
  return true;
}

export function markUsersKnownToExist(): void {
  usersKnownToExist = true;
}
