import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** איפוס לקוח הוסר */
export async function POST() {
  return NextResponse.json({ ok: false, error: "Feature removed" }, { status: 404 });
}
