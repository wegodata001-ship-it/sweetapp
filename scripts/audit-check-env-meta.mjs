import fs from "node:fs";

const f = ".env.production.audit";
if (!fs.existsSync(f)) {
  console.log(JSON.stringify({ ok: false, reason: "missing_env_file" }));
  process.exit(1);
}
const t = fs.readFileSync(f, "utf8");
const lines = t.split(/\r?\n/).filter((l) => /^DATABASE_URL=|^DIRECT_URL=/.test(l));
const out = [];
for (const l of lines) {
  const eq = l.indexOf("=");
  const key = l.slice(0, eq);
  let v = l.slice(eq + 1);
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1);
  }
  const isPlaceholder =
    /SENSITIVE|placeholder|replace them/i.test(v) || v.length < 20;
  out.push({
    key,
    isPlaceholder,
    length: v.length,
    looksLikePostgres: /^postgres(ql)?:\/\//i.test(v),
  });
}
console.log(
  JSON.stringify(
    {
      ok: true,
      DB_configured: lines.some((l) => l.startsWith("DATABASE_URL=")),
      DIRECT_configured: lines.some((l) => l.startsWith("DIRECT_URL=")),
      urls: out,
    },
    null,
    2,
  ),
);
