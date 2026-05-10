import { NextResponse } from "next/server";
import { prismaReady } from "@/lib/prisma";

export async function requireDb(): Promise<NextResponse | null> {
  if (!(await prismaReady())) {
    return NextResponse.json(
      { ok: false, error: "מסד נתונים לא מוגדר. הגדרו DATABASE_URL (Supabase Postgres)." },
      { status: 503 },
    );
  }
  return null;
}
