import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";

export const dynamic = "force-dynamic";

function sumMinutes(steps: { estimatedMinutes: number }[]) {
  return steps.reduce((s, x) => s + Math.max(0, Math.floor(Number(x.estimatedMinutes) || 0)), 0);
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const block = await requireDb();
  if (block) return block;
  const { id } = await ctx.params;
  try {
    const row = await prisma.recipe.findFirst({
      where: { id, isActive: true },
      include: { steps: { orderBy: { orderIndex: "asc" } } },
    });
    if (!row) return NextResponse.json({ ok: false, error: "לא נמצא" }, { status: 404 });
    return NextResponse.json({ ok: true, data: row });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const block = await requireDb();
  if (block) return block;
  const session = await getSessionFromCookie();
  if (!session) return NextResponse.json({ ok: false, error: "לא מחובר" }, { status: 401 });
  const { id } = await ctx.params;
  try {
    const body = (await req.json()) as {
      title?: string;
      description?: string | null;
      quantityLabel?: string | null;
      estimatedOutput?: string | null;
      isActive?: boolean;
      steps?: { title: string; description?: string | null; estimatedMinutes: number; icon?: string | null }[];
    };

    const existing = await prisma.recipe.findFirst({ where: { id } });
    if (!existing) return NextResponse.json({ ok: false, error: "לא נמצא" }, { status: 404 });

    if (body.steps && body.steps.length > 0) {
      const stepsIn = body.steps;
      await prisma.$transaction(async (tx) => {
        await tx.recipeRun.updateMany({
          where: { recipeId: id, status: "active" },
          data: { status: "cancelled", activeStepId: null, stepStartedAt: null },
        });
        await tx.recipeStep.deleteMany({ where: { recipeId: id } });
        const steps = stepsIn.map((s, i) => ({
          title: s.title.trim(),
          description: s.description?.trim() || null,
          estimatedMinutes: Math.max(0, Math.floor(Number(s.estimatedMinutes) || 0)),
          orderIndex: i,
          icon: s.icon?.trim() || null,
        }));
        await tx.recipeStep.createMany({
          data: steps.map((s) => ({ ...s, recipeId: id })),
        });
        await tx.recipe.update({
          where: { id },
          data: {
            ...(body.title !== undefined ? { title: body.title.trim() } : {}),
            ...(body.description !== undefined ? { description: body.description?.trim() || null } : {}),
            ...(body.quantityLabel !== undefined ? { quantityLabel: body.quantityLabel?.trim() || null } : {}),
            ...(body.estimatedOutput !== undefined ? { estimatedOutput: body.estimatedOutput?.trim() || null } : {}),
            ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
            totalMinutes: sumMinutes(steps),
          },
        });
      });
    } else {
      await prisma.recipe.update({
        where: { id },
        data: {
          ...(body.title !== undefined ? { title: body.title.trim() } : {}),
          ...(body.description !== undefined ? { description: body.description?.trim() || null } : {}),
          ...(body.quantityLabel !== undefined ? { quantityLabel: body.quantityLabel?.trim() || null } : {}),
          ...(body.estimatedOutput !== undefined ? { estimatedOutput: body.estimatedOutput?.trim() || null } : {}),
          ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
        },
      });
    }

    const row = await prisma.recipe.findUnique({
      where: { id },
      include: { steps: { orderBy: { orderIndex: "asc" } } },
    });
    return NextResponse.json({ ok: true, data: row });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const block = await requireDb();
  if (block) return block;
  const { id } = await ctx.params;
  try {
    await prisma.recipe.update({ where: { id }, data: { isActive: false } });
    await prisma.recipeRun.updateMany({
      where: { recipeId: id, status: "active" },
      data: { status: "cancelled", activeStepId: null, stepStartedAt: null },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
