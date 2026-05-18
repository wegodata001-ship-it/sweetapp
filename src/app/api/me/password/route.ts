import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { appendRefreshedSessionCookie } from "@/lib/auth/reissue-session";
import { executeSelfServicePasswordChange } from "@/lib/auth/self-service-password-change";
import { createTranslator } from "@/lib/i18n/translator";
import { normalizeLocale, WEGO_LOCALE_COOKIE } from "@/lib/i18n/constants";

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const locale = normalizeLocale(cookieStore.get(WEGO_LOCALE_COOKIE)?.value);
  const t = createTranslator(locale);

  const session = await getSessionFromCookie();
  if (!session?.sub) {
    return NextResponse.json(
      { ok: false, code: "UNAUTHORIZED", message: t("toasts.loginRequired") },
      { status: 401 },
    );
  }

  let body: { currentPassword?: string; newPassword?: string; confirmPassword?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { ok: false, code: "INVALID_BODY", message: t("common.error") },
      { status: 400 },
    );
  }

  const result = await executeSelfServicePasswordChange({
    userId: session.sub,
    currentPassword: body.currentPassword ?? "",
    newPassword: body.newPassword ?? "",
    confirmPassword: body.confirmPassword ?? "",
    t,
  });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, code: result.code, message: result.message },
      { status: result.status },
    );
  }

  const res = NextResponse.json({ ok: true });
  const okCookie = await appendRefreshedSessionCookie(res, session.sub);
  if (!okCookie) {
    return NextResponse.json(
      { ok: false, code: "SESSION_REFRESH_FAILED", message: t("auth.errors.sessionRefreshFailed") },
      { status: 500 },
    );
  }
  return res;
}
