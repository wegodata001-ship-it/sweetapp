import fs from "node:fs";

const f = ".env.local";
if (!fs.existsSync(f)) {
  console.log(JSON.stringify({ exists: false }));
  process.exit(0);
}
const t = fs.readFileSync(f, "utf8");
function get(k) {
  const m = t.match(new RegExp("^" + k + "=(.*)$", "m"));
  if (!m) return null;
  let v = m[1].trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1);
  }
  return v;
}
function summarize(v) {
  if (!v) return null;
  let hostHint = { parseError: true };
  try {
    const u = new URL(v.replace(/^postgresql:/, "postgres:"));
    hostHint = {
      protocol: u.protocol,
      hasUser: Boolean(u.username),
      hasPass: Boolean(u.password),
      hostnameEndsWith: (u.hostname || "").split(".").slice(-2).join("."),
      port: u.port || null,
    };
  } catch {
    /* ignore */
  }
  return {
    length: v.length,
    isPlaceholder: /SENSITIVE|placeholder/i.test(v) || v.length < 20,
    looksLikePostgres: /^postgres(ql)?:\/\//i.test(v),
    hostHint,
  };
}
console.log(
  JSON.stringify(
    {
      exists: true,
      DATABASE_URL: summarize(get("DATABASE_URL")),
      DIRECT_URL: summarize(get("DIRECT_URL")),
      otherKeys: [...t.matchAll(/^([A-Z0-9_]+)=/gm)]
        .map((m) => m[1])
        .filter((k) => k !== "DATABASE_URL" && k !== "DIRECT_URL"),
    },
    null,
    2,
  ),
);
