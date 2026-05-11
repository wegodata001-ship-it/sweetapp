import { NextRequest, NextResponse } from "next/server";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { deleteGeneratedReportRecord } from "@/lib/pdf/persist-generated-report";

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const block = await requireDb();
  if (block) return block;

  const session = await getSessionFromCookie();
  if (!session?.sub) {
    return NextResponse.json({ ok: false, error: "נדרשת התחברות" }, { status: 401 });
  }

  const { id } = await ctx.params;
  if (!id?.trim()) return NextResponse.json({ ok: false, error: "חסר מזהה" }, { status: 400 });

  const res = await deleteGeneratedReportRecord(id);
  if (!res.ok) {
    return NextResponse.json({ ok: false, error: res.error ?? "מחיקה נכשלה" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
