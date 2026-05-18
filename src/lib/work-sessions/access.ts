import { redirect } from "next/navigation";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { prismaAny } from "@/lib/prisma";
import type { SessionJwtPayload } from "@/lib/auth/jwt";

/**
 * Require the caller to be authenticated AND (if they are an EMPLOYEE) to
 * currently have an open `WorkSession`. Admin / super-admin roles bypass
 * the clock-in gate so they can supervise employees without "starting a
 * shift" themselves.
 *
 * Used by every server component under `/employee/*` (except the clock-in
 * screen itself) — redirects to `/login` or `/employee/clock` when needed.
 */
export async function requireActiveWorkSession(): Promise<SessionJwtPayload> {
  const session = await getSessionFromCookie();
  if (!session) {
    redirect("/login");
  }
  if (session.role === "EMPLOYEE") {
    const active = await prismaAny.workSession.findFirst({
      where: { userId: session.sub, status: "ACTIVE" },
      select: { id: true },
    });
    if (!active) {
      redirect("/employee/clock");
    }
  }
  return session;
}

/**
 * Same shape as above but without any redirect — returns whether the user
 * has an active session. Useful for API routes that want to soft-fail
 * (return a JSON 403) rather than redirect.
 */
export async function hasActiveWorkSession(userId: string): Promise<boolean> {
  const active = await prismaAny.workSession.findFirst({
    where: { userId, status: "ACTIVE" },
    select: { id: true },
  });
  return Boolean(active);
}
