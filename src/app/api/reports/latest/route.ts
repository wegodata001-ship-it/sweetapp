import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";

/** דוח אחרון לפי סוג + מזהה מקושר */
export async function GET(req: NextRequest) {
  const block = await requireDb();
  if (block) return block;

  try {
    const type = req.nextUrl.searchParams.get("type")?.trim();
    const relatedId = req.nextUrl.searchParams.get("relatedId")?.trim();
    if (!relatedId) {
      return NextResponse.json({ ok: false, error: "חסר relatedId" }, { status: 400 });
    }

    const row = await prisma.generatedReport.findFirst({
      where: { relatedId, ...(type ? { type } : {}) },
      orderBy: { createdAt: "desc" },
      include: {
        createdBy: { select: { id: true, fullName: true, email: true } },
      },
    });

    return NextResponse.json({ ok: true, data: row });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
