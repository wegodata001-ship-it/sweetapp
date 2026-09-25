import { NextRequest, NextResponse } from "next/server";
import { requireDb } from "@/lib/api-route";
import { authorizeCron } from "@/lib/cron/authorize";
import { enforceMaxShiftLength } from "@/lib/work-sessions/auto-checkout";
import { reportSystemFailureAsync } from "@/lib/notifications/system-alert-dispatch";

export const dynamic = "force-dynamic";

/**
 * Closes open shifts that have reached 12 hours.
 * Checkout time is clockIn + 12h even when this job runs later.
 * Page loads also enforce the rule; this job covers periods when nobody is online.
 */
async function handle(req: NextRequest) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const block = await requireDb();
  if (block) return block;
  try {
    const closed = await enforceMaxShiftLength();
    return NextResponse.json({
      ok: true,
      ranAt: new Date().toISOString(),
      closed: closed.length,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "internal error";
    reportSystemFailureAsync({
      category: "cronFailure",
      title: "cron יציאה אוטומטית נכשל",
      message,
    });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
