import { NextRequest, NextResponse } from "next/server";
import { requireDb } from "@/lib/api-route";
import { runDailyCheckNotifications } from "@/lib/checks/notify";

export const dynamic = "force-dynamic";

/**
 * /api/cron/check-alerts
 *
 * Scheduled endpoint for the checks daily alert pipeline. Should be invoked by
 * an external scheduler (Vercel Cron, Supabase scheduled function, or a plain
 * `curl` from cron) every morning (or every few hours; the daily dedup makes
 * repeated invocations safe).
 *
 * Logic (per spec):
 *  1. Find PENDING/DEPOSITED checks where dueDate = today + 7 → send
 *     "due in 7 days" alert (deduped per day per check).
 *  2. Find PENDING/DEPOSITED checks where dueDate = today → send
 *     "due today" alert; UI/serializer treats them as DUE_TODAY.
 *  3. Find PENDING/DEPOSITED checks where dueDate < today and status !=
 *     DEPOSITED/CLEARED → effective LATE. The serializer/effectiveCheckStatus
 *     helpers expose this without mutating DB state (one source of truth).
 *
 * Auth: requires `x-cron-secret` header OR `?key=...` query that matches
 * `process.env.CRON_SECRET`. If `CRON_SECRET` is unset (development), the
 * endpoint is open — set the env var before deploying.
 */
function authorize(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return true;
  const headerToken =
    req.headers.get("x-cron-secret")?.trim() ||
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ||
    "";
  if (headerToken && headerToken === secret) return true;
  const queryToken = req.nextUrl.searchParams.get("key")?.trim() ?? "";
  return Boolean(queryToken) && queryToken === secret;
}

async function handle(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const block = await requireDb();
  if (block) return block;
  try {
    const result = await runDailyCheckNotifications();
    return NextResponse.json({
      ok: true,
      ranAt: new Date().toISOString(),
      ...result,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "internal error" },
      { status: 500 },
    );
  }
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
