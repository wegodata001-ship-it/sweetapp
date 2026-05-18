import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";

export const dynamic = "force-dynamic";

function sumMinutes(steps: { estimatedMinutes: number }[]) {
  return steps.reduce((s, x) => s + Math.max(0, Math.floor(Number(x.estimatedMinutes) || 0)), 0);
}

export async function GET(req: NextRequest) {
  const block = await requireDb();
  if (block) return block;
  try {
    const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
    const rows = await prisma.recipe.findMany({
      where: {
        isActive: true,
        ...(q ? { title: { contains: q, mode: "insensitive" } } : {}),
      },
      orderBy: { updatedAt: "desc" },
      include: {
        _count: { select: { steps: true } },
      },
    });
    const data = rows.map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      quantityLabel: r.quantityLabel,
      totalMinutes: r.totalMinutes,
      estimatedOutput: r.estimatedOutput,
      isActive: r.isActive,
      stepCount: r._count.steps,
      updatedAt: r.updatedAt.toISOString(),
    }));
    return NextResponse.json({ ok: true, data });
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
  if (!session) return NextResponse.json({ ok: false, error: "לא מחובר" }, { status: 401 });
  try {
    const body = (await req.json()) as {
      title: string;
      description?: string | null;
      quantityLabel?: string | null;
      estimatedOutput?: string | null;
      steps: { title: string; description?: string | null; estimatedMinutes: number; icon?: string | null }[];
    };
    if (!body.title?.trim()) return NextResponse.json({ ok: false, error: "חסר שם" }, { status: 400 });
    if (!Array.isArray(body.steps) || body.steps.length === 0) {
      return NextResponse.json({ ok: false, error: "חובה לפחות שלב אחד" }, { status: 400 });
    }
    const steps = body.steps.map((s, i) => ({
      title: s.title.trim(),
      description: s.description?.trim() || null,
      estimatedMinutes: Math.max(0, Math.floor(Number(s.estimatedMinutes) || 0)),
      orderIndex: i,
      icon: s.icon?.trim() || null,
    }));
    const totalMinutes = sumMinutes(steps);
    const recipe = await prisma.recipe.create({
      data: {
        title: body.title.trim(),
        description: body.description?.trim() || null,
        quantityLabel: body.quantityLabel?.trim() || null,
        estimatedOutput: body.estimatedOutput?.trim() || null,
        totalMinutes,
        createdById: session.sub,
        steps: { create: steps },
      },
      include: { steps: { orderBy: { orderIndex: "asc" } } },
    });
    return NextResponse.json({ ok: true, data: recipe });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
