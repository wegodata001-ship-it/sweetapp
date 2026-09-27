import { NextRequest, NextResponse } from "next/server";
import { prismaAny } from "@/lib/prisma";
import { ensureBootstrapSuperAdmin, markUsersKnownToExist } from "@/lib/auth/bootstrap";
import { verifyPassword } from "@/lib/auth/password";
import { resolveLoginUser } from "@/lib/auth/resolve-login-user";
import { signSessionToken, COOKIE_NAME } from "@/lib/auth/jwt";
import { getPermissionStringsForUser } from "@/lib/auth/user-permissions";
import { logActivity } from "@/lib/activity-log";
import {
  createUserSession,
  parseActiveSessionIds,
  requestClientMeta,
} from "@/lib/auth/session-binding";
import { enforceMaxShiftLength } from "@/lib/work-sessions/auto-checkout";
import {
  AUTH_API_CODES,
  authErrorResponse,
  handleAuthApiCatch,
  logAuthApiError,
} from "@/lib/auth/auth-api-errors";

async function writeAudit(params: {
  userId: string | null;
  identifier: string;
  action: "login_success" | "login_failed";
  reason?: string;
  req: NextRequest;
}): Promise<void> {
  try {
    const ip =
      params.req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      params.req.headers.get("x-real-ip") ||
      null;
    const userAgent = params.req.headers.get("user-agent") || null;
    await prismaAny.loginAudit.create({
      data: {
        userId: params.userId,
        identifier: params.identifier,
        action: params.action,
        reason: params.reason ?? null,
        ip,
        userAgent,
      },
    });
  } catch {
    // האודיט לא חוסם זרימת התחברות
  }
}

export async function POST(req: NextRequest) {
  const started = performance.now();
  let bootstrapMs = 0;
  let userMs = 0;
  let passwordMs = 0;
  let sessionMs = 0;
  let afterMs = 0;
  try {
    const body = (await req.json()) as {
      identifier?: string;
      email?: string;
      nationalId?: string;
      password?: string;
    };

    const rawIdentifier =
      body.identifier?.trim() ||
      body.nationalId?.trim() ||
      body.email?.trim() ||
      "";
    const password = body.password;
    if (!rawIdentifier || !password) {
      return authErrorResponse(AUTH_API_CODES.REQUIRED_FIELDS, 400);
    }

    const userStarted = performance.now();
    let user = await resolveLoginUser(rawIdentifier);
    userMs = performance.now() - userStarted;
    if (user) markUsersKnownToExist();

    if (!user) {
      const bootstrapStarted = performance.now();
      try {
        if (await ensureBootstrapSuperAdmin()) {
          user = await resolveLoginUser(rawIdentifier);
        }
      } catch (bootstrapErr) {
        logAuthApiError("AUTH_BOOTSTRAP_ERROR", bootstrapErr);
      }
      bootstrapMs = performance.now() - bootstrapStarted;
    }

    if (!user) {
      await writeAudit({
        userId: null,
        identifier: rawIdentifier,
        action: "login_failed",
        reason: "not_found",
        req,
      });
      return authErrorResponse(AUTH_API_CODES.INVALID_CREDENTIALS, 401);
    }

    if (!user.isActive) {
      await writeAudit({
        userId: user.id,
        identifier: rawIdentifier,
        action: "login_failed",
        reason: "inactive",
        req,
      });
      return authErrorResponse(AUTH_API_CODES.ACCOUNT_DISABLED, 401);
    }

    const passwordStarted = performance.now();
    const ok = await verifyPassword(password, user.passwordHash);
    passwordMs = performance.now() - passwordStarted;
    if (!ok) {
      await writeAudit({
        userId: user.id,
        identifier: rawIdentifier,
        action: "login_failed",
        reason: "bad_password",
        req,
      });
      return authErrorResponse(AUTH_API_CODES.INVALID_CREDENTIALS, 401);
    }

    const joinedStarted = performance.now();
    let activityMs = 0;
    let auditMs = 0;
    let enforceMs = 0;
    const permissionsPromise = getPermissionStringsForUser(
      user.id,
      user.role as "EMPLOYEE" | "ADMIN" | "SUPER_ADMIN",
    );
    const clientMeta = requestClientMeta(req.headers);
    const sessionPromise = (async () => {
      const sessionStarted = performance.now();
      const id = await createUserSession(user.id, clientMeta, {
        role: user.role,
        allowMultiple: user.role === "ADMIN" || user.role === "SUPER_ADMIN",
        knownSessionIds: parseActiveSessionIds(user.currentSessionId),
      });
      sessionMs = performance.now() - sessionStarted;
      return id;
    })();
    const [, sessionId, permissions] = await Promise.all([
      Promise.all([
        (async () => {
          const t = performance.now();
          await logActivity(user.id, "login");
          activityMs = performance.now() - t;
        })(),
        (async () => {
          const t = performance.now();
          await writeAudit({
            userId: user.id,
            identifier: rawIdentifier,
            action: "login_success",
            req,
          });
          auditMs = performance.now() - t;
        })(),
        (async () => {
          const t = performance.now();
          await enforceMaxShiftLength({ userId: user.id }).catch((error) => {
            console.error("[login] auto checkout", error);
          });
          enforceMs = performance.now() - t;
        })(),
      ]),
      sessionPromise,
      permissionsPromise,
    ]);
    afterMs = Math.max(activityMs, auditMs, enforceMs);
    const joinedMs = performance.now() - joinedStarted;

    const token = await signSessionToken({
      sub: user.id,
      email: user.email,
      role: user.role as "EMPLOYEE" | "ADMIN" | "SUPER_ADMIN",
      permissions,
      sid: sessionId,
      mustChangePassword: Boolean(user.mustChangePassword),
    });

    const res = NextResponse.json({
      ok: true,
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        nationalId: user.nationalId ?? null,
        phone: user.phone ?? null,
        role: user.role,
        mustChangePassword: Boolean(user.mustChangePassword),
        permissions,
      },
    });

    res.headers.set(
      "Server-Timing",
      [
        ["bootstrap", bootstrapMs],
        ["user", userMs],
        ["password", passwordMs],
        ["session", sessionMs],
        ["activity", activityMs],
        ["audit", auditMs],
        ["enforce", enforceMs],
        ["after", afterMs],
        ["joined", joinedMs],
        ["total", performance.now() - started],
      ]
        .map(([name, ms]) => `${name};dur=${Math.max(0, Math.round(Number(ms)))}`)
        .join(", "),
    );

    res.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });

    return res;
  } catch (e) {
    return handleAuthApiCatch("AUTH_LOGIN_ERROR", e);
  }
}
