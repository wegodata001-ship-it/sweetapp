import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { normalizeLocale, type AppLocale } from "@/lib/i18n/constants";

export const dynamic = "force-dynamic";

/** DEV בלבד — טוען locales/*.json מהדיסק (בלי cache של webpack) */
export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ ok: false, error: "Not available" }, { status: 404 });
  }
  const loc = normalizeLocale(req.nextUrl.searchParams.get("locale") ?? "he") as AppLocale;
  try {
    const file = join(process.cwd(), "locales", `${loc}.json`);
    const raw = readFileSync(file, "utf8");
    const data = JSON.parse(raw) as unknown;
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "read failed" },
      { status: 500 },
    );
  }
}
