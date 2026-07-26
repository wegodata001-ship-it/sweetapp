// Read-only guard against "column does not exist" runtime errors.
// Compares every model in schema.prisma against the live database and reports any
// column the Prisma Client would query but the database does not have.
// Performs no writes. Exits non-zero when a column is missing, so it can gate a deploy.
//
//   npm run db:audit
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const schemaSrc = readFileSync(path.join(here, "..", "prisma", "schema.prisma"), "utf8");

const SCALARS = new Set([
  "String", "Int", "Float", "Boolean", "DateTime", "Json", "Decimal", "BigInt", "Bytes",
]);

const enums = new Set([...schemaSrc.matchAll(/^enum\s+(\w+)\s*\{/gm)].map((m) => m[1]));

/** model name -> { table, fields: [{ field, column, type }] } */
function parseModels(src) {
  const models = new Map();
  for (const m of src.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
    const [, name, body] = m;
    const mapped = body.match(/@@map\("([^"]+)"\)/);
    const fields = [];
    for (const raw of body.split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("//") || line.startsWith("@@")) continue;
      const [field, type] = line.split(/\s+/);
      if (!field || !type) continue;
      const base = type.replace(/[?[\]]/g, "");
      // Only scalars and enums are physical columns; relations are not.
      if (!SCALARS.has(base) && !enums.has(base)) continue;
      // A list of scalars is a real column, but a list of models is not - already filtered above.
      const col = line.match(/@map\("([^"]+)"\)/);
      fields.push({ field, column: col ? col[1] : field, type });
    }
    models.set(name, { table: mapped ? mapped[1] : name, fields });
  }
  return models;
}

const prisma = new PrismaClient();
try {
  const models = parseModels(schemaSrc);
  const tables = [...models.values()].map((m) => m.table);

  const cols = await prisma.$queryRawUnsafe(
    `SELECT table_name, column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
    tables,
  );
  const byTable = new Map();
  for (const c of cols) {
    if (!byTable.has(c.table_name)) byTable.set(c.table_name, new Set());
    byTable.get(c.table_name).add(c.column_name);
  }

  let missingTables = 0;
  let missingColumns = 0;
  const report = [];

  for (const [model, { table, fields }] of models) {
    const actual = byTable.get(table);
    if (!actual) {
      missingTables++;
      report.push(`  TABLE MISSING  ${model} -> "${table}"`);
      continue;
    }
    for (const f of fields) {
      if (!actual.has(f.column)) {
        missingColumns++;
        report.push(`  COLUMN MISSING ${model}.${f.field} -> "${table}"."${f.column}" (${f.type})`);
      }
    }
  }

  console.log(`Checked ${models.size} models / ${tables.length} tables against the live database.`);
  if (report.length) {
    console.log("\nProblems found:");
    console.log(report.join("\n"));
    console.log(
      "\nFix by adding an additive migration (ALTER TABLE ... ADD COLUMN IF NOT EXISTS)," +
        "\nthen `prisma migrate deploy` and `prisma generate`. Never reset the database.",
    );
  } else {
    console.log("OK - every model column in schema.prisma exists in the database.");
  }
  process.exitCode = missingTables + missingColumns > 0 ? 1 : 0;
} finally {
  await prisma.$disconnect();
}
