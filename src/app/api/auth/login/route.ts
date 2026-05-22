import { NextRequest, NextResponse } from "next/server";
import { prismaAny } from "@/lib/prisma";
import { ensureBootstrapSuperAdmin } from "@/lib/auth/bootstrap";
import { verifyPassword } from "@/lib/auth/password";
import { resolveLoginUser } from "@/lib/auth/resolve-login-user";
import { signSessionToken, COOKIE_NAME } from "@/lib/auth/jwt";
import { getPermissionStringsForUser } from "@/lib/auth/user-permissions";
import { logActivity } from "@/lib/activity-log";
import { looksLikeEmail } from "@/lib/employees/national-id";

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
  try {
    await ensureBootstrapSuperAdmin();

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
      return NextResponse.json(
        { ok: false, code: "missing_fields", error: "תעודת זהות / אימייל וסיסמה נדרשים" },
        { status: 400 },
      );
    }

    const user = await resolveLoginUser(rawIdentifier);

    if (!user) {
      await writeAudit({
        userId: null,
        identifier: rawIdentifier,
        action: "login_failed",
        reason: "not_found",
        req,
      });
      const hint = looksLikeEmail(rawIdentifier)
        ? "bad_credentials"
        : "use_national_id";
      return NextResponse.json(
        {
          ok: false,
          code: hint,
          error: "פרטי התחברות שגויים",
        },
        { status: 401 },
      );
    }

    if (!user.isActive) {
      await writeAudit({
        userId: user.id,
        identifier: rawIdentifier,
        action: "login_failed",
        reason: "inactive",
        req,
      });
      return NextResponse.json(
        {
          ok: false,
          code: "inactive",
          error: "המשתמש אינו פעיל — פנו למנהל",
        },
        { status: 401 },
      );
    }

    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) {
      await writeAudit({
        userId: user.id,
        identifier: rawIdentifier,
        action: "login_failed",
        reason: "bad_password",
        req,
      });
      return NextResponse.json(
        { ok: false, code: "bad_credentials", error: "פרטי התחברות שגויים" },
        { status: 401 },
      );
    }

    const permissions = await getPermissionStringsForUser(user.id, user.role as "EMPLOYEE" | "ADMIN" | "SUPER_ADMIN");

    const token = await signSessionToken({
      sub: user.id,
      email: user.email,
      role: user.role as "EMPLOYEE" | "ADMIN" | "SUPER_ADMIN",
      permissions,
      mustChangePassword: Boolean(user.mustChangePassword),
    });

    await Promise.all([
      logActivity(user.id, "login"),
      writeAudit({
        userId: user.id,
        identifier: rawIdentifier,
        action: "login_success",
        req,
      }),
    ]);

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

    res.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });

    return res;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "שגיאה";
    const code = msg.includes("JWT_SECRET") ? "server_config" : "server_error";
    return NextResponse.json(
      { ok: false, code, error: msg },
      { status: 500 },
    );
  }
}
