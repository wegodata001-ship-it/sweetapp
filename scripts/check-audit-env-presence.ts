import fs from "node:fs";
import path from "node:path";

const envPath = path.join(process.cwd(), ".env.production.audit");
if (!fs.existsSync(envPath)) {
  console.log("FILE: MISSING");
  process.exit(2);
}
const text = fs.readFileSync(envPath, "utf8");
const lines = text.split(/\r?\n/);
console.log("FILE: PRESENT");
console.log("LINE_COUNT:", lines.length);
console.log("HAS_BOM:", text.charCodeAt(0) === 0xfeff);
for (let i = 0; i < lines.length; i++) {
  const line = lines[i].replace(/^\uFEFF/, "").trim();
  if (!line) continue;
  const commented = line.startsWith("#");
  const m = line.match(/^(?:#\s*)?(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/);
  if (!m) {
    console.log(`LINE ${i + 1}: ${commented ? "COMMENT" : "UNPARSED"}`);
    continue;
  }
  const rest = line.slice(line.indexOf("=") + 1).trim();
  const empty = !rest || rest === '""' || rest === "''";
  console.log(
    `LINE ${i + 1}: ${commented ? "COMMENTED_KEY" : "KEY"} ${m[1]} ${empty ? "EMPTY" : "NON_EMPTY"}`,
  );
}
