import { PrismaClient, UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const DEV_EMAIL = "admin.dev@wego.local";
const DEV_PASSWORD = "Wego!2026";

async function main() {
  const users = await prisma.user.findMany({
    select: { email: true, nationalId: true, role: true, isActive: true, fullName: true },
    orderBy: { createdAt: "asc" },
  });
  console.log(`\n=== Existing users (${users.length}) ===`);
  for (const u of users) {
    console.log(
      `- ${u.fullName} | email=${u.email} | nationalId=${u.nationalId ?? "-"} | role=${u.role} | active=${u.isActive}`,
    );
  }

  const passwordHash = await bcrypt.hash(DEV_PASSWORD, 12);
  const existing = await prisma.user.findUnique({ where: { email: DEV_EMAIL } });
  if (existing) {
    await prisma.user.update({
      where: { email: DEV_EMAIL },
      data: {
        passwordHash,
        isActive: true,
        mustChangePassword: false,
        role: UserRole.SUPER_ADMIN,
        currentSessionId: null,
      },
    });
    console.log(`\n=== Reset dev admin password ===`);
  } else {
    await prisma.user.create({
      data: {
        fullName: "Dev Admin",
        email: DEV_EMAIL,
        passwordHash,
        role: UserRole.SUPER_ADMIN,
        isActive: true,
        mustChangePassword: false,
      },
    });
    console.log(`\n=== Created dev admin ===`);
  }
  console.log(`email:    ${DEV_EMAIL}`);
  console.log(`password: ${DEV_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
