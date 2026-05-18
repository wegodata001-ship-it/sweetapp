import { NextRequest, NextResponse } from "next/server";
import { prismaAny } from "@/lib/prisma";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { normalizeLocale } from "@/lib/i18n/constants";

export async function PATCH(req: NextRequest) {
  const session = await getSessionFromCookie();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as { language?: string };
  const language = normalizeLocale(body.language);

  await prismaAny.user.update({
    where: { id: session.sub },
    data: { language },
  });

  return NextResponse.json({ ok: true, data: { language } });
}
