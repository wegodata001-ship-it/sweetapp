import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import {
  normalizeFieldType,
  parseOptionsLines,
  parseOptionsJson,
} from "@/lib/forms/field-types";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const block = await requireDb();
  if (block) return block;
  const { id } = await ctx.params;
  try {
    const body = (await req.json()) as {
      label?: string;
      fieldType?: string;
      placeholder?: string | null;
      required?: boolean;
      sortOrder?: number;
      optionsText?: string;
      optionsJson?: unknown | null;
    };

    const data: Prisma.DynamicFormFieldUpdateInput = {};

    if (body.label !== undefined) {
      const t = body.label.trim();
      if (!t) return NextResponse.json({ ok: false, error: "שם ריק" }, { status: 400 });
      data.label = t;
    }

    const nextType = body.fieldType !== undefined ? normalizeFieldType(body.fieldType) : undefined;
    if (nextType !== undefined) data.fieldType = nextType;

    if (body.placeholder !== undefined) {
      data.placeholder = body.placeholder?.trim() || null;
    }
    if (body.required !== undefined) data.required = Boolean(body.required);
    if (body.sortOrder !== undefined) data.sortOrder = body.sortOrder;

    const existing = await prisma.dynamicFormField.findUnique({
      where: { id },
      select: { fieldType: true },
    });
    const resolvedType = nextType ?? existing?.fieldType;

    if (resolvedType === "SELECT") {
      if (body.optionsJson !== undefined) {
        data.optionsJson =
          body.optionsJson === null
            ? Prisma.JsonNull
            : (parseOptionsJson(body.optionsJson) as Prisma.InputJsonValue);
      } else if (typeof body.optionsText === "string") {
        data.optionsJson = parseOptionsLines(body.optionsText) as Prisma.InputJsonValue;
      }
    } else if (nextType !== undefined && nextType !== "SELECT") {
      data.optionsJson = Prisma.JsonNull;
    }

    const row = await prisma.dynamicFormField.update({
      where: { id },
      data,
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
    await prisma.dynamicFormField.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
