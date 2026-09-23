/**
 * Load `.env.production.audit` into process.env. Never logs values.
 * Import this module before constructing PrismaClient.
 */
import fs from "node:fs";
import path from "node:path";

export const AUDIT_ENV_FILE = ".env.production.audit";

const LOADABLE_KEYS = [
  "DATABASE_URL",
  "DIRECT_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_STORAGE_BUCKET",
  "NEXT_PUBLIC_SUPABASE_REPORTS_BUCKET",
  "WEGO_SOURCE_FILES_BUCKET",
  "WEGO_DOCUMENTS_BUCKET",
] as const;

function parseEnvFile(filePath: string): Record<string, string> {
  const text = fs.readFileSync(filePath, "utf8");
  const out: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/^\uFEFF/, "").trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let val = m[2];
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[m[1]] = val;
  }
  return out;
}

export function databaseUrlPresence(env: NodeJS.ProcessEnv = process.env): "PRESENT" | "ABSENT" {
  return env.DATABASE_URL?.trim() ? "PRESENT" : "ABSENT";
}

export function loadAuditEnv(): {
  ok: boolean;
  reason?: string;
  databaseUrl: "PRESENT" | "ABSENT";
  loadedKeys: string[];
} {
  const already = databaseUrlPresence();
  if (already === "PRESENT") {
    return { ok: true, databaseUrl: "PRESENT", loadedKeys: [] };
  }

  const envPath = path.join(process.cwd(), AUDIT_ENV_FILE);
  if (!fs.existsSync(envPath)) {
    return { ok: false, reason: "MISSING_AUDIT_ENV_FILE", databaseUrl: "ABSENT", loadedKeys: [] };
  }

  const parsed = parseEnvFile(envPath);
  const loadedKeys: string[] = [];
  for (const key of LOADABLE_KEYS) {
    const val = parsed[key]?.trim();
    if (!val) continue;
    if (key === "DATABASE_URL" && (val.length < 20 || /SENSITIVE|placeholder/i.test(val))) {
      return {
        ok: false,
        reason: "PLACEHOLDER_DATABASE_URL",
        databaseUrl: "ABSENT",
        loadedKeys,
      };
    }
    if (!process.env[key]?.trim()) {
      process.env[key] = val;
      loadedKeys.push(key);
    }
  }

  return {
    ok: databaseUrlPresence() === "PRESENT",
    reason: databaseUrlPresence() === "PRESENT" ? undefined : "NO_DATABASE_URL",
    databaseUrl: databaseUrlPresence(),
    loadedKeys,
  };
}

loadAuditEnv();
