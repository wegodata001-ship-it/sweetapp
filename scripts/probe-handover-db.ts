/**
 * Read-only connection probe. Never prints DATABASE_URL, host, user, or password.
 */
import dns from "node:dns/promises";
import net from "node:net";
import { PrismaClient } from "@prisma/client";
import { loadAuditEnv } from "../src/lib/handover/load-audit-env";
import { normalizeDatabaseUrl } from "../src/lib/prisma-db-health";

type HostType = "DIRECT" | "TRANSACTION POOLER" | "SESSION POOLER";

function errorCode(e: unknown): string {
  if (e && typeof e === "object" && "code" in e && typeof (e as { code: unknown }).code === "string") {
    return (e as { code: string }).code;
  }
  const msg = e instanceof Error ? e.message : String(e);
  const m = msg.match(/\bP\d{4}\b/);
  if (m) return m[0];
  if (/can't reach database server/i.test(msg)) return "P1001";
  if (/timed out/i.test(msg)) return "P1002";
  return "CONNECTION_FAILED";
}

function classify(hostname: string, port: string): HostType {
  const host = hostname.toLowerCase();
  const isPooler = host.includes("pooler");
  if (isPooler && port === "6543") return "TRANSACTION POOLER";
  if (isPooler) return "SESSION POOLER";
  return "DIRECT";
}

function parseDbTarget(): { host: string; port: string; type: HostType } | null {
  const raw = process.env.DATABASE_URL?.trim();
  if (!raw) return null;
  try {
    const u = new URL(normalizeDatabaseUrl(raw).replace(/^postgresql:/i, "postgres:"));
    const host = u.hostname;
    const port = u.port || "5432";
    if (!host) return null;
    return { host, port, type: classify(host, port) };
  } catch {
    return null;
  }
}

async function dnsResolved(hostname: string): Promise<boolean> {
  try {
    const r = await dns.lookup(hostname);
    return Boolean(r.address);
  } catch {
    return false;
  }
}

function tcpConnect(hostname: string, port: string): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host: hostname, port: Number(port), timeout: 8000 });
    const done = (ok: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(ok);
    };
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}

function fail(code: string, extras?: { type?: string; port?: string; dns?: string; tcp?: string }) {
  console.log("DATABASE CONNECTION: FAIL");
  console.log(`ERROR CODE: ${code}`);
  console.log(`HOST TYPE: ${extras?.type ?? "UNKNOWN"}`);
  console.log(`PORT: ${extras?.port ?? "UNKNOWN"}`);
  console.log(`DNS RESOLVED: ${extras?.dns ?? "NO"}`);
  console.log(`TCP CONNECTION: ${extras?.tcp ?? "FAIL"}`);
}

async function main() {
  const env = loadAuditEnv();
  if (env.databaseUrl !== "PRESENT") {
    fail("NO_DATABASE_URL");
    process.exit(2);
  }

  const target = parseDbTarget();
  if (!target) {
    fail("UNPARSEABLE_DATABASE_URL");
    process.exit(2);
  }

  const dnsOk = await dnsResolved(target.host);
  const tcpOk = dnsOk ? await tcpConnect(target.host, target.port) : false;
  const extras = {
    type: target.type,
    port: target.port,
    dns: dnsOk ? "YES" : "NO",
    tcp: tcpOk ? "PASS" : "FAIL",
  };

  if (!dnsOk || !tcpOk) {
    fail(dnsOk ? "P1001" : "ENOTFOUND", extras);
    process.exit(1);
  }

  const prisma = new PrismaClient({ log: [] });
  try {
    await prisma.customer.count();
    console.log("DATABASE CONNECTION: PASS");
    console.log(`HOST TYPE: ${target.type}`);
    console.log(`PORT: ${target.port}`);
    console.log("DNS RESOLVED: YES");
    console.log("TCP CONNECTION: PASS");
    await prisma.$disconnect();
    process.exit(0);
  } catch (e) {
    fail(errorCode(e), extras);
    await prisma.$disconnect().catch(() => undefined);
    process.exit(1);
  }
}

main();
