import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import {
  normalizeFieldType,
  parseOptionsLines,
  parseOptionsJson,
} from "@/lib/forms/field-types";

export async function GET() {
  const block = await requireDb();
  if (block) return block;
  try {
    const rows = await prisma.dynamicFormField.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
    return NextResponse.json({ ok: true, data: rows });
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
      label?: string;
      fieldType?: string;
      placeholder?: string | null;
      required?: boolean;
      sortOrder?: number;
      /** ל‑SELECT — מחרוזות מופרדות בשורות */
      optionsText?: string;
      optionsJson?: unknown;
    };
    if (!body.label?.trim()) return NextResponse.json({ ok: false, error: "חסר שם שדה" }, { status: 400 });

    const fieldType = normalizeFieldType(body.fieldType ?? "STRING");
    let optionsJson: Prisma.InputJsonValue | typeof Prisma.JsonNull = Prisma.JsonNull;
    if (fieldType === "SELECT") {
      if (body.optionsJson !== undefined && body.optionsJson !== null) {
        optionsJson = parseOptionsJson(body.optionsJson) as Prisma.InputJsonValue;
      } else if (typeof body.optionsText === "string") {
        optionsJson = parseOptionsLines(body.optionsText) as Prisma.InputJsonValue;
      } else {
        optionsJson = [];
      }
    }

    const row = await prisma.dynamicFormField.create({
      data: {
        label: body.label.trim(),
        fieldType,
        placeholder: body.placeholder?.trim() || null,
        required: Boolean(body.required),
        sortOrder: body.sortOrder ?? 0,
        optionsJson,
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
