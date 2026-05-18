import { NextRequest, NextResponse } from "next/server";
import { prismaAny } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";

export async function GET(req: NextRequest) {
  const block = await requireDb();
  if (block) return block;
  const { searchParams } = req.nextUrl;
  const includeInactive = searchParams.get("all") === "1";

  try {
    const rows = await prismaAny.inventoryLocation.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, description: true, isActive: true, createdAt: true },
    });
    return NextResponse.json({
      ok: true,
      data: rows.map((r: { createdAt: Date; [k: string]: unknown }) => ({
        ...r,
        createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
      })),
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const block = await requireDb();
  if (block) return block;
  const session = await getSessionFromCookie();
  if (!session?.sub) {
    return NextResponse.json({ ok: false, error: "נדרשת התחברות" }, { status: 401 });
  }

  try {
    const body = (await req.json()) as { name?: string; description?: string | null };
    const name = body.name?.trim();
    if (!name) return NextResponse.json({ ok: false, error: "חסר שם מיקום" }, { status: 400 });

    const row = await prismaAny.inventoryLocation.create({
      data: {
        name,
        description: body.description?.trim() || null,
        isActive: true,
      },
    });
    return NextResponse.json({ ok: true, data: row });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("Unique constraint") || msg.includes("unique constraint")) {
      return NextResponse.json({ ok: false, error: "שם מיקום כבר קיים" }, { status: 400 });
    }
    return NextResponse.json({ ok: false, error: msg || "שגיאה" }, { status: 500 });
  }
}
