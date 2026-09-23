import { NextResponse } from "next/server";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { isManagerRole } from "@/lib/notifications/me-inbox";
import { runBusinessExport } from "@/lib/handover/run-business-export";
import { redactSecrets } from "@/lib/handover/serialize";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

function contentDisposition(fileName: string): string {
  const fallback = `WEGO_business_${new Date().toISOString().slice(0, 10)}.zip`;
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

/** POST — ייצוא קריאה בלבד. אין DELETE/UPDATE/INSERT. */
export async function POST() {
  const block = await requireDb();
  if (block) return block;

  const session = await getSessionFromCookie();
  if (!session || !isManagerRole(session.role)) {
    return NextResponse.json({ ok: false, error: "אין הרשאה" }, { status: 403 });
  }

  try {
    const pkg = await runBusinessExport();
    return new NextResponse(Buffer.from(pkg.zip), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": contentDisposition(pkg.zipFileName),
        "Cache-Control": "no-store",
        "X-Export-Sha256": pkg.sha256,
        "X-Export-Counts-Pass": pkg.validation.countsPass ? "1" : "0",
      },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: redactSecrets(e instanceof Error ? e.message : "ייצוא נכשל") },
      { status: 500 },
    );
  }
}
