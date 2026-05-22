import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** גיבוי לפני איפוס לקוח הוסר */
export async function GET() {
  return NextResponse.json({ ok: false, error: "Feature removed" }, { status: 404 });
}
