import { NextRequest, NextResponse } from "next/server";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import {
  listDocumentEmailContacts,
  upsertDocumentEmailContact,
} from "@/lib/finance/document-email-contacts";

export const dynamic = "force-dynamic";

/** רשימת אנשי קשר לשליחת מסמכים — מועדפים ואחרונים */
export async function GET() {
  const block = await requireDb();
  if (block) return block;

  const session = await getSessionFromCookie();
  if (!session?.sub) {
    return NextResponse.json({ ok: false, error: "נדרשת התחברות" }, { status: 401 });
  }

  try {
    const data = await listDocumentEmailContacts();
    return NextResponse.json({ ok: true, data });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}

/** יצירה / עדכון איש קשר */
export async function POST(req: NextRequest) {
  const block = await requireDb();
  if (block) return block;

  const session = await getSessionFromCookie();
  if (!session?.sub) {
    return NextResponse.json({ ok: false, error: "נדרשת התחברות" }, { status: 401 });
  }

  let body: { email?: unknown; name?: unknown; isFavorite?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "גוף בקשה לא תקין" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email : "";
  if (!email.trim()) {
    return NextResponse.json({ ok: false, error: "חסרה כתובת מייל" }, { status: 400 });
  }

  const row = await upsertDocumentEmailContact({
    email,
    name: typeof body.name === "string" ? body.name : null,
    isFavorite: typeof body.isFavorite === "boolean" ? body.isFavorite : undefined,
  });

  if (!row) {
    return NextResponse.json({ ok: false, error: "כתובת מייל לא תקינה" }, { status: 400 });
  }

  return NextResponse.json({ ok: true, data: row });
}
