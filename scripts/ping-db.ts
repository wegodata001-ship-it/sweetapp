import { pingDatabase, prisma } from "../src/lib/prisma";

async function main() {
  const ok = await pingDatabase();
  console.log("DATABASE_URL ping:", ok ? "OK" : "FAILED");
  await prisma.$disconnect();
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
