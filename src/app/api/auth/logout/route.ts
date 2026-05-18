import { NextRequest, NextResponse } from "next/server";
import { COOKIE_NAME } from "@/lib/auth/jwt";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { prismaAny } from "@/lib/prisma";
import { logActivity } from "@/lib/activity-log";

export async function POST(req: NextRequest) {
  const session = await getSessionFromCookie();

  if (session?.sub) {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      null;
    const userAgent = req.headers.get("user-agent") || null;
    try {
      await prismaAny.loginAudit.create({
        data: {
          userId: session.sub,
          identifier: session.email ?? "",
          action: "logout",
          ip,
          userAgent,
        },
      });
    } catch {
      /* לא חוסם זרימה */
    }
    await logActivity(session.sub, "logout");
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}
