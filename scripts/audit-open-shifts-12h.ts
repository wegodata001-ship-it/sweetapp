/**
 * Read-only audit of open shifts older than 12 hours.
 * Pass --apply to close only those open rows at checkIn + 12h.
 * Already-closed historical shifts are not selected.
 */
import { prisma } from "../src/lib/prisma";
import {
  enforceMaxShiftLength,
  previewOpenShiftsOverMax,
} from "../src/lib/work-sessions/auto-checkout";

async function main() {
  const preview = await previewOpenShiftsOverMax();
  console.log(
    JSON.stringify(
      {
        phase: "preview",
        count: preview.length,
        rows: preview,
      },
      null,
      2,
    ),
  );

  if (process.argv.includes("--apply")) {
    const applied = await enforceMaxShiftLength();
    console.log(
      JSON.stringify(
        {
          phase: "applied",
          count: applied.length,
          rows: applied,
        },
        null,
        2,
      ),
    );
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
