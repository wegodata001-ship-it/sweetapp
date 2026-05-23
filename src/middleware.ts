import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifySessionToken, COOKIE_NAME } from "@/lib/auth/jwt";
import {
  employeeWorkflowApiAllowed,
  isPureEmployeeRole,
} from "@/lib/auth/employee-api-access";
import { API_ACCESS_RULES, PAGE_ACCESS_RULES, matchRule } from "@/lib/auth/permissions";
import { WEGO_LOCALE_COOKIE, normalizeLocale } from "@/lib/i18n/constants";
import { createTranslator } from "@/lib/i18n/translator";
import type { UserRole } from "@prisma/client";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const localeCookie = request.cookies.get(WEGO_LOCALE_COOKIE)?.value;
  const locale = normalizeLocale(localeCookie);
  const t = createTranslator(locale);

  if (pathname.startsWith("/_next") || pathname === "/favicon.ico") {
    return NextResponse.next();
  }
  if (/\.(?:svg|png|jpg|jpeg|gif|webp|ico)$/.test(pathname)) {
    return NextResponse.next();
  }

  if (pathname === "/login") {
    const loginTok = request.cookies.get(COOKIE_NAME)?.value;
    const loginSession = loginTok ? await verifySessionToken(loginTok) : null;
    if (loginSession) {
      if (loginSession.mustChangePassword === true) {
        return NextResponse.redirect(new URL("/change-password", request.url));
      }
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }
  if (pathname === "/api/auth/login") {
    return NextResponse.next();
  }
  if (pathname === "/api/auth/me" && request.method === "GET") {
    return NextResponse.next();
  }
  if (pathname === "/api/auth/logout" && request.method === "POST") {
    return NextResponse.next();
  }
  // Cron endpoints validate their own secret token; let them through middleware.
  if (pathname.startsWith("/api/cron/")) {
    return NextResponse.next();
  }
  if (pathname === "/api/debug/test-email" && request.method === "POST") {
    const key =
      request.headers.get("x-email-test-key")?.trim() ||
      request.nextUrl.searchParams.get("key")?.trim() ||
      "";
    const secret = process.env.EMAIL_TEST_SECRET?.trim() || process.env.JWT_SECRET?.trim();
    if (key && secret && key === secret) {
      return NextResponse.next();
    }
  }

  const token = request.cookies.get(COOKIE_NAME)?.value;
  const session = token ? await verifySessionToken(token) : null;

  if (!session) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { ok: false, error: t("toasts.loginRequired") },
        { status: 401 },
      );
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (session.mustChangePassword === true) {
    if (pathname.startsWith("/api/")) {
      const apiPath = pathname.replace(/\/+$/, "") || "/";
      if (request.method === "OPTIONS") {
        return NextResponse.next();
      }
      const allowed =
        (apiPath === "/api/auth/change-password" && request.method === "POST") ||
        (apiPath === "/api/me/password" && request.method === "POST") ||
        (apiPath === "/api/auth/logout" && request.method === "POST") ||
        (apiPath === "/api/auth/me" && request.method === "GET");
      if (allowed) {
        return NextResponse.next();
      }
      return NextResponse.json(
        {
          ok: false,
          code: "MUST_CHANGE_PASSWORD",
          message: t("auth.errors.mustChangeBeforeContinue"),
        },
        { status: 403 },
      );
    }

    if (pathname === "/change-password" || pathname.startsWith("/change-password/")) {
      return NextResponse.next();
    }

    const changeUrl = new URL("/change-password", request.url);
    return NextResponse.redirect(changeUrl);
  }

  const role = session.role as UserRole;
  const permSet = new Set(session.permissions);

  const canAccessMyTasksPage =
    role === "SUPER_ADMIN" ||
    role === "EMPLOYEE" ||
    role === "ADMIN" ||
    permSet.has("employee_clock") ||
    permSet.has("tasks");

  // Pure EMPLOYEEs land on their dedicated portal — the admin dashboard at "/"
  // is for managers. Admins / super-admins still see the root dashboard.
  if (role === "EMPLOYEE" && pathname === "/") {
    return NextResponse.redirect(new URL("/employee", request.url));
  }

  const isDailyOrdersPath =
    pathname === "/admin/daily-orders" ||
    pathname.startsWith("/admin/daily-orders/") ||
    pathname === "/admin/future-orders" ||
    pathname.startsWith("/admin/future-orders/");

  const isWeddingOrdersPath =
    pathname === "/admin/wedding-orders" || pathname.startsWith("/admin/wedding-orders/");

  if (isPureEmployeeRole(role)) {
    if (pathname.startsWith("/manager")) {
      return NextResponse.redirect(new URL("/employee", request.url));
    }
    if (pathname.startsWith("/admin") && !isDailyOrdersPath && !isWeddingOrdersPath) {
      const adminRule = matchRule(pathname, PAGE_ACCESS_RULES);
      if (
        adminRule &&
        adminRule !== "SUPER_ADMIN_ONLY" &&
        adminRule !== "ADMIN_ONLY" &&
        permSet.has(adminRule)
      ) {
        // עובד עם הרשאה (משימות, מלאי וכו') — מותר לגשת לנתיבי /admin הרלוונטיים
      } else {
        return NextResponse.redirect(new URL("/employee", request.url));
      }
    }
  }

  if (pathname.startsWith("/api/")) {
    const apiUrl = request.nextUrl;
    /** נתיב API בלי סלאש סופי — כדי שה־regex יתאים לפני matchRule */
    const apiPath = pathname.replace(/\/+$/, "") || "/";

    if (request.method === "OPTIONS") {
      return NextResponse.next();
    }

    if (
      (apiPath === "/api/auth/change-password" || apiPath === "/api/me/password") &&
      request.method === "POST"
    ) {
      return NextResponse.next();
    }

    if (apiPath === "/api/work/my-tasks" && request.method === "GET" && canAccessMyTasksPage) {
      return NextResponse.next();
    }
    /** התחלה/סיום משימות — בעלות לפי assignedToUserId בשרת */
    if (
      request.method === "POST" &&
      canAccessMyTasksPage &&
      apiPath.startsWith("/api/work/tasks/") &&
      (apiPath.endsWith("/start") || apiPath.endsWith("/complete"))
    ) {
      return NextResponse.next();
    }

    if (isPureEmployeeRole(role)) {
      if (apiPath.startsWith("/api/admin/")) {
        return NextResponse.json({ ok: false, error: t("toasts.noPermission") }, { status: 403 });
      }
      if (apiPath.startsWith("/api/workflows/")) {
        if (employeeWorkflowApiAllowed(apiPath, request.method)) {
          return NextResponse.next();
        }
        return NextResponse.json({ ok: false, error: t("toasts.noPermission") }, { status: 403 });
      }
      if (apiPath === "/api/notifications" || apiPath.startsWith("/api/notifications/")) {
        return NextResponse.json({ ok: false, error: t("toasts.noPermission") }, { status: 403 });
      }
      if (apiPath.startsWith("/api/task-groups")) {
        return NextResponse.json({ ok: false, error: t("toasts.noPermission") }, { status: 403 });
      }
    }
    if (
      apiPath === "/api/employees" &&
      request.method === "GET" &&
      (apiUrl.searchParams.get("forTasks") === "1" ||
        apiUrl.searchParams.get("forWorkOrder") === "1") &&
      (role === "SUPER_ADMIN" || permSet.has("tasks"))
    ) {
      return NextResponse.next();
    }
    if (
      apiPath.startsWith("/api/payments") &&
      role !== "SUPER_ADMIN" &&
      !permSet.has("financial_registration") &&
      permSet.has("ledger")
    ) {
      return NextResponse.next();
    }
    if (apiPath.startsWith("/api/reports")) {
      if (role === "SUPER_ADMIN") return NextResponse.next();
      if (permSet.has("financial_registration") || permSet.has("cash_flow")) return NextResponse.next();
      return NextResponse.json({ ok: false, error: t("toasts.noPermission") }, { status: 403 });
    }
    if (apiPath === "/api/me/attendance" || apiPath.startsWith("/api/me/attendance/")) {
      if (!canAccessMyTasksPage) {
        return NextResponse.json({ ok: false, error: t("toasts.noPermission") }, { status: 403 });
      }
      return NextResponse.next();
    }
    if (apiPath === "/api/me/work-session" || apiPath.startsWith("/api/me/work-session/")) {
      return NextResponse.next();
    }
    if (apiPath === "/api/me/dashboard") {
      return NextResponse.next();
    }
    if (apiPath === "/api/me/alerts" || apiPath.startsWith("/api/me/alerts/")) {
      return NextResponse.next();
    }
    if (apiPath === "/api/me/notifications" || apiPath.startsWith("/api/me/notifications/")) {
      return NextResponse.next();
    }
    if (apiPath === "/api/me/notification-preferences") {
      return NextResponse.next();
    }
    if (apiPath === "/api/notifications" || apiPath.startsWith("/api/notifications/")) {
      return NextResponse.next();
    }
    if (apiPath === "/api/me/language" && request.method === "PATCH") {
      return NextResponse.next();
    }
    if (apiPath === "/api/work-status/heartbeat" && request.method === "POST") {
      if (!canAccessMyTasksPage) {
        return NextResponse.json({ ok: false, error: t("toasts.noPermission") }, { status: 403 });
      }
      return NextResponse.next();
    }
    if (apiPath === "/api/work-status/me") {
      if (!canAccessMyTasksPage) {
        return NextResponse.json({ ok: false, error: t("toasts.noPermission") }, { status: 403 });
      }
      return NextResponse.next();
    }
    if (apiPath === "/api/work-status/board") {
      if (role === "SUPER_ADMIN" || permSet.has("tasks")) {
        return NextResponse.next();
      }
      return NextResponse.json({ ok: false, error: t("toasts.noPermission") }, { status: 403 });
    }
    if (apiPath === "/api/future-orders" || apiPath.startsWith("/api/future-orders/")) {
      return NextResponse.next();
    }
    const rule = matchRule(apiPath, API_ACCESS_RULES);
    if (rule === null && role !== "SUPER_ADMIN") {
      return NextResponse.json({ ok: false, error: t("toasts.noPermission") }, { status: 403 });
    }
    if (rule === "SUPER_ADMIN_ONLY" && role !== "SUPER_ADMIN") {
      return NextResponse.json({ ok: false, error: t("toasts.noPermission") }, { status: 403 });
    }
    if (rule && rule !== "SUPER_ADMIN_ONLY" && role !== "SUPER_ADMIN" && !permSet.has(rule)) {
      return NextResponse.json({ ok: false, error: t("toasts.noPermission") }, { status: 403 });
    }
    return NextResponse.next();
  }

  if (pathname === "/employee/tasks" || pathname.startsWith("/employee/tasks/")) {
    if (!canAccessMyTasksPage) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  if (pathname === "/employee/work-status" || pathname.startsWith("/employee/work-status/")) {
    if (!canAccessMyTasksPage) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  if (pathname === "/ops/attendance" || pathname.startsWith("/ops/attendance/")) {
    if (!canAccessMyTasksPage) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    if (role === "SUPER_ADMIN" || permSet.has("tasks")) {
      return NextResponse.redirect(new URL("/admin/staff", request.url));
    }
    return NextResponse.redirect(new URL("/employee/attendance", request.url));
  }

  if (pathname === "/employee/attendance" || pathname.startsWith("/employee/attendance/")) {
    if (!canAccessMyTasksPage) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  if (isWeddingOrdersPath) {
    if (role === "SUPER_ADMIN" || role === "ADMIN") {
      return NextResponse.next();
    }
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (isDailyOrdersPath) {
    return NextResponse.next();
  }

  const pageRule = matchRule(pathname, PAGE_ACCESS_RULES);
  if (pageRule === "SUPER_ADMIN_ONLY" && role !== "SUPER_ADMIN") {
    return NextResponse.redirect(new URL("/", request.url));
  }
  if (
    pathname.startsWith("/finance/register") &&
    role !== "SUPER_ADMIN" &&
    !permSet.has("financial_registration") &&
    permSet.has("ledger")
  ) {
    return NextResponse.next();
  }
  if (
    pageRule &&
    pageRule !== "SUPER_ADMIN_ONLY" &&
    pageRule !== "ADMIN_ONLY" &&
    role !== "SUPER_ADMIN" &&
    !permSet.has(pageRule)
  ) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
