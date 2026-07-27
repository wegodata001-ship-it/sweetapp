import { NextRequest, NextResponse } from "next/server";
import { requireDb } from "@/lib/api-route";
import { authorizeCron } from "@/lib/cron/authorize";
import { runSmartNotifications } from "@/lib/notifications/run-smart-notifications";
import { reportSystemFailureAsync } from "@/lib/notifications/system-alert-dispatch";

export const dynamic = "force-dynamic";

async function handle(req: NextRequest) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const block = await requireDb();
  if (block) return block;
  try {
    const result = await runSmartNotifications();
    return NextResponse.json({ ok: true, ranAt: new Date().toISOString(), ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "internal error";
    reportSystemFailureAsync({
      category: "cronFailure",
      title: "cron התראות חכמות נכשל",
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
