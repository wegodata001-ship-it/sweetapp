import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const migrations = await prisma.$queryRaw<{ migration_name: string; finished_at: Date | null }[]>`
    SELECT migration_name, finished_at FROM "_prisma_migrations" ORDER BY finished_at
  `.catch(() => null);

  const col = await prisma.$queryRaw<{ column_name: string }[]>`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'FinancialDocument' AND column_name = 'sentToCpaEmail'
  `;

  const table = await prisma.$queryRaw<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'AccountantEmailLog'
    ) AS exists
  `;

  console.log(JSON.stringify({ migrations, hasSentToCpaEmail: col.length > 0, hasAccountantEmailLog: table[0]?.exists }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
