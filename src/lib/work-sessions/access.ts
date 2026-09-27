import { redirect } from "next/navigation";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { prismaAny } from "@/lib/prisma";
import type { SessionJwtPayload } from "@/lib/auth/jwt";
import { enforceMaxShiftLength } from "@/lib/work-sessions/auto-checkout";

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
    const closed = await enforceMaxShiftLength({ userId: session.sub });
    const active = await prismaAny.workSession.findFirst({
      where: { userId: session.sub, status: "ACTIVE" },
      select: { id: true },
    });
    if (!active) {
      const auto = closed.some((row) => row.userId === session.sub);
      redirect(auto ? "/employee/clock?ended=auto" : "/employee/clock");
    }
  }
  return session;
}

/**
 * Same shape as above but without any redirect — returns whether the user
 * has an active session. Useful for API routes that want to soft-fail
 * (return a JSON 403) rather than redirect.
 */
/** Employees cannot start or finish work tasks after the 12h shift is closed. */
export async function assertEmployeeShiftOpen(
  session: SessionJwtPayload,
): Promise<{ ok: true } | { ok: false }> {
  if (session.role !== "EMPLOYEE") return { ok: true };
  const open = await hasActiveWorkSession(session.sub);
  return open ? { ok: true } : { ok: false };
}

export async function hasActiveWorkSession(userId: string): Promise<boolean> {
  await enforceMaxShiftLength({ userId });
  const active = await prismaAny.workSession.findFirst({
    where: { userId, status: "ACTIVE" },
    select: { id: true },
  });
  return Boolean(active);
}
