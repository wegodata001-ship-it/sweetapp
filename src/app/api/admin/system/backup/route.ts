import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { requireDb } from "@/lib/api-route";
import { exportClientDataBackup } from "@/lib/system/reset-client-data";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** GET — ייצוא JSON לגיבוי (SUPER_ADMIN בלבד) */
export async function GET() {
  const block = await requireDb();
  if (block) return block;

  const session = await getSessionFromCookie();
  if (!session || session.role !== "SUPER_ADMIN") {
    return NextResponse.json({ ok: false, error: "אין הרשאה" }, { status: 403 });
  }

  const backup = await exportClientDataBackup();
  const filename = `wego-client-backup-${new Date().toISOString().slice(0, 10)}.json`;

  return new NextResponse(JSON.stringify(backup, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
