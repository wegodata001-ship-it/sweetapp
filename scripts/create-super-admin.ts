/**
 * יצירה/עדכון SUPER_ADMIN לפי תעודת זהות / טלפון כשם משתמש.
 * שימוש: npx tsx scripts/create-super-admin.ts
 */
import { PrismaClient, UserRole } from "@prisma/client";
import { hashPassword } from "../src/lib/auth/password";
import {
  buildInternalEmail,
  normalizeNationalId,
} from "../src/lib/employees/national-id";

/** ארגומנט 1: ת״ז/טלפון, ארגומנט 2: סיסמה (לא נלקח מ-SUPER_ADMIN_PASSWORD ב-.env) */
const NATIONAL_ID_RAW = process.argv[2] ?? process.env.SUPER_ADMIN_NATIONAL_ID ?? "0523607944";
const PASSWORD = process.argv[3] ?? "12345678";
const FULL_NAME = process.env.SUPER_ADMIN_NAME ?? "Super Admin";

const prisma = new PrismaClient();

async function main() {
  const nationalId = normalizeNationalId(NATIONAL_ID_RAW);
  if (!nationalId) {
    throw new Error("nationalId ריק");
  }

  const email = buildInternalEmail(nationalId);
  const passwordHash = await hashPassword(PASSWORD);

  const existing = await prisma.user.findFirst({
    where: {
      OR: [{ nationalId }, { email }, { phone: NATIONAL_ID_RAW }],
    },
  });

  if (existing) {
    const user = await prisma.user.update({
      where: { id: existing.id },
      data: {
        fullName: FULL_NAME,
        nationalId,
        email: existing.email.includes("@") ? existing.email : email,
        phone: NATIONAL_ID_RAW,
        passwordHash,
        role: UserRole.SUPER_ADMIN,
        isActive: true,
        mustChangePassword: false,
        passwordUpdatedAt: new Date(),
      },
    });
    console.log("[OK] SUPER_ADMIN updated:", {
      id: user.id,
      nationalId: user.nationalId,
      email: user.email,
      role: user.role,
    });
    return;
  }

  const user = await prisma.user.create({
    data: {
      fullName: FULL_NAME,
      email,
      nationalId,
      phone: NATIONAL_ID_RAW,
      passwordHash,
      role: UserRole.SUPER_ADMIN,
      isActive: true,
      mustChangePassword: false,
    },
  });

  console.log("[OK] SUPER_ADMIN created:", {
    id: user.id,
    nationalId: user.nationalId,
    email: user.email,
    role: user.role,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
