import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";

/** עובדי משימות = משתמשים EMPLOYEE פעילים (לא טבלת Employee) */
export async function GET() {
  const block = await requireDb();
  if (block) return block;
  try {
    const rows = await prisma.user.findMany({
      where: {
        role: UserRole.EMPLOYEE,
        isActive: true,
      },
      orderBy: { fullName: "asc" },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
      },
    });
    return NextResponse.json({ ok: true, data: rows });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
