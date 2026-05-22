import { NextResponse } from "next/server";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { computeDashboardSummary } from "@/lib/dashboard/summary";
import { WEGO_LOCALE_COOKIE, normalizeLocale } from "@/lib/i18n/constants";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export async function GET() {
  const block = await requireDb();
  if (block) return block;

  const session = await getSessionFromCookie();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const cookieStore = await cookies();
  const locale = normalizeLocale(cookieStore.get(WEGO_LOCALE_COOKIE)?.value);

  try {
    const data = await computeDashboardSummary(locale);
    return NextResponse.json({ ok: true, data });
  } catch (e) {
    console.error("[api/dashboard/summary]", e);
    return NextResponse.json({ ok: false, error: "Failed to load dashboard" }, { status: 500 });
  }
}
