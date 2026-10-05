import { unstable_cache } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { parseDashboardPeriodSearch } from "@/lib/dashboard/dashboard-period";
import { DASHBOARD_CACHE_TAG } from "@/lib/dashboard/invalidate";
import {
  computeDashboardSummary,
  computeDashboardHeroSlice,
  type DashboardHeroSlice,
  type DashboardSummary,
} from "@/lib/dashboard/summary";
import { WEGO_LOCALE_COOKIE, normalizeLocale } from "@/lib/i18n/constants";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

const CACHE_HEADERS = { "Cache-Control": "private, no-store" };

const getCachedDashboardSummary = unstable_cache(
  async (locale: string, period: string, from: string, to: string) =>
    computeDashboardSummary(locale, {
      period: period === "custom" ? { period: "custom", from, to } : undefined,
    }),
  ["dashboard-summary"],
  { revalidate: 20, tags: [DASHBOARD_CACHE_TAG] },
);

const getCachedDashboardHero = unstable_cache(
  async (locale: string, period: string, from: string, to: string) =>
    computeDashboardHeroSlice(locale, {
      period: period === "custom" ? { period: "custom", from, to } : undefined,
    }),
  ["dashboard-hero"],
  { revalidate: 20, tags: [DASHBOARD_CACHE_TAG] },
);

function cacheArgs(req: NextRequest): [string, string, string] {
  const parsed = parseDashboardPeriodSearch(req.nextUrl.searchParams);
  if (parsed.period === "custom") return ["custom", parsed.from, parsed.to];
  return ["preset", "", ""];
}

export async function GET(req: NextRequest) {
  const block = await requireDb();
  if (block) return block;

  const session = await getSessionFromCookie();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const cookieStore = await cookies();
  const locale = normalizeLocale(cookieStore.get(WEGO_LOCALE_COOKIE)?.value);
  const section = req.nextUrl.searchParams.get("section");
  const [period, from, to] = cacheArgs(req);

  try {
    if (section === "hero") {
      const data = await getCachedDashboardHero(locale, period, from, to);
      return NextResponse.json(
        { ok: true, data } satisfies { ok: true; data: DashboardHeroSlice },
        { headers: CACHE_HEADERS },
      );
    }

    const data = await getCachedDashboardSummary(locale, period, from, to);
    return NextResponse.json(
      { ok: true, data } satisfies { ok: true; data: DashboardSummary },
      { headers: CACHE_HEADERS },
    );
  } catch (e) {
    console.error("[api/dashboard/summary]", e);
    return NextResponse.json({ ok: false, error: "Failed to load dashboard" }, { status: 500 });
  }
}
