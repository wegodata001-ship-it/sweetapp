import { NextRequest, NextResponse } from "next/server";
import { requireDb } from "@/lib/api-route";
import { runSmartNotifications } from "@/lib/notifications/run-smart-notifications";

export const dynamic = "force-dynamic";

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
    const result = await runSmartNotifications();
    return NextResponse.json({ ok: true, ranAt: new Date().toISOString(), ...result });
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
