import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";

export const dynamic = "force-dynamic";

const SEARCH_HEADERS = { "Cache-Control": "private, max-age=15" };

export async function GET(req: NextRequest) {
  const block = await requireDb();
  if (block) return block;
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (!q) {
    return NextResponse.json({ ok: true, data: [] }, { headers: SEARCH_HEADERS });
  }
  try {
    const rows = await prisma.customer.findMany({
      where: {
        name: {
          contains: q,
          mode: "insensitive",
        },
      },
      select: {
        id: true,
        name: true,
        phone: true,
        customerType: true,
      },
      orderBy: { name: "asc" },
      take: 10,
    });
    return NextResponse.json({ ok: true, data: rows }, { headers: SEARCH_HEADERS });
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
  try {
    const body = (await req.json()) as {
      name: string;
      phone?: string | null;
      customerType?: string | null;
      openingBalance?: number;
    };
    if (!body.name?.trim()) {
      return NextResponse.json({ ok: false, error: "חסר שם" }, { status: 400 });
    }
    const row = await prisma.customer.create({
      data: {
        name: body.name.trim(),
        phone: body.phone?.trim() || null,
        customerType: body.customerType?.trim() || null,
        openingBalance: body.openingBalance ?? 0,
      },
      select: { id: true, name: true, phone: true, customerType: true },
    });
    return NextResponse.json({ ok: true, data: row });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
