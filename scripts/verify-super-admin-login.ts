import { PrismaClient } from "@prisma/client";
import { hashPassword, verifyPassword } from "../src/lib/auth/password";
import { normalizeNationalId } from "../src/lib/employees/national-id";

const prisma = new PrismaClient();

async function main() {
  const nationalId = normalizeNationalId("0523607944");
  const user = await prisma.user.findFirst({ where: { nationalId } });
  console.log("user:", user?.id, user?.role, user?.isActive);
  if (!user) return;
  console.log("hash prefix:", user.passwordHash.slice(0, 7), "len:", user.passwordHash.length);
  const fresh = await hashPassword("12345678");
  console.log("fresh verify:", await verifyPassword("12345678", fresh));
  console.log("stored verify:", await verifyPassword("12345678", user.passwordHash));
  if (!(await verifyPassword("12345678", user.passwordHash))) {
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: fresh, mustChangePassword: false },
    });
    console.log("password re-hashed and saved");
  }
}

main().finally(() => prisma.$disconnect());
