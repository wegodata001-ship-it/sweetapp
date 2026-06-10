import { NextRequest, NextResponse } from "next/server";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { setDocumentEmailContactFavorite } from "@/lib/finance/document-email-contacts";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const block = await requireDb();
  if (block) return block;

  const session = await getSessionFromCookie();
  if (!session?.sub) {
    return NextResponse.json({ ok: false, error: "נדרשת התחברות" }, { status: 401 });
  }

  const { id } = await ctx.params;
  let body: { isFavorite?: unknown; name?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "גוף בקשה לא תקין" }, { status: 400 });
  }

  if (typeof body.isFavorite !== "boolean") {
    return NextResponse.json({ ok: false, error: "חסר isFavorite" }, { status: 400 });
  }

  const row = await setDocumentEmailContactFavorite(id, body.isFavorite);
  if (!row) {
    return NextResponse.json({ ok: false, error: "איש קשר לא נמצא" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, data: row });
}
