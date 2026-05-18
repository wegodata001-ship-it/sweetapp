import { NextRequest, NextResponse } from "next/server";
import { prismaAny } from "@/lib/prisma";
import { ensureBootstrapSuperAdmin } from "@/lib/auth/bootstrap";
import { verifyPassword } from "@/lib/auth/password";
import { signSessionToken, COOKIE_NAME } from "@/lib/auth/jwt";
import { getPermissionStringsForUser } from "@/lib/auth/user-permissions";
import { logActivity } from "@/lib/activity-log";
import { looksLikeEmail, normalizeNationalId } from "@/lib/employees/national-id";

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
        { ok: false, error: "תעודת זהות / אימייל וסיסמה נדרשים" },
        { status: 400 },
      );
    }

    // נחזיק את שתי הפניות — אימייל / תעודת זהות
    const isEmail = looksLikeEmail(rawIdentifier);
    const lookupEmail = isEmail ? rawIdentifier.toLowerCase() : null;
    const lookupNationalId = !isEmail ? normalizeNationalId(rawIdentifier) : null;

    const user = await prismaAny.user.findFirst({
      where: lookupEmail
        ? { email: lookupEmail }
        : lookupNationalId
          ? { nationalId: lookupNationalId }
          : { id: "__never__" },
    });

    if (!user) {
      await writeAudit({
        userId: null,
        identifier: rawIdentifier,
        action: "login_failed",
        reason: "not_found",
        req,
      });
      return NextResponse.json({ ok: false, error: "פרטי התחברות שגויים" }, { status: 401 });
    }

    if (!user.isActive) {
      await writeAudit({
        userId: user.id,
        identifier: rawIdentifier,
        action: "login_failed",
        reason: "inactive",
        req,
      });
      return NextResponse.json({ ok: false, error: "המשתמש אינו פעיל" }, { status: 401 });
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
      return NextResponse.json({ ok: false, error: "פרטי התחברות שגויים" }, { status: 401 });
    }

    const permissions = await getPermissionStringsForUser(user.id, user.role);

    const token = await signSessionToken({
      sub: user.id,
      email: user.email,
      role: user.role,
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
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
