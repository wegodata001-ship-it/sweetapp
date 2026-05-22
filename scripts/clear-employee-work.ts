import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const tasksBefore = await prisma.employeeTask.count();
  const groupsBefore = await prisma.employeeTaskGroup.count();

  const delTasks = await prisma.employeeTask.deleteMany({});
  const delGroups = await prisma.employeeTaskGroup.deleteMany({});

  console.log(
    JSON.stringify(
      {
        tasksBefore,
        groupsBefore,
        deletedTasks: delTasks.count,
        deletedGroups: delGroups.count,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
