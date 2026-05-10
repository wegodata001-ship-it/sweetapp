import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifySessionToken, COOKIE_NAME } from "@/lib/auth/jwt";
import { API_ACCESS_RULES, PAGE_ACCESS_RULES, matchRule } from "@/lib/auth/permissions";
import type { UserRole } from "@prisma/client";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

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
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }
  if (pathname === "/api/auth/login") {
    return NextResponse.next();
  }
  if (pathname === "/api/auth/me" || pathname === "/api/auth/logout") {
    return NextResponse.next();
  }

  const token = request.cookies.get(COOKIE_NAME)?.value;
  const session = token ? await verifySessionToken(token) : null;

  if (!session) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ ok: false, error: "נדרשת התחברות" }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  const role = session.role as UserRole;
  const permSet = new Set(session.permissions);

  const canAccessMyTasksPage =
    role === "SUPER_ADMIN" ||
    role === "EMPLOYEE" ||
    permSet.has("employee_clock") ||
    permSet.has("tasks");

  if (pathname.startsWith("/api/")) {
    const apiUrl = request.nextUrl;
    if (pathname === "/api/tasks/my" && request.method === "GET" && canAccessMyTasksPage) {
      return NextResponse.next();
    }
    if (
      /^\/api\/tasks\/[^/]+$/.test(pathname) &&
      request.method === "PATCH" &&
      canAccessMyTasksPage
    ) {
      return NextResponse.next();
    }
    if (
      pathname === "/api/tasks" &&
      apiUrl.searchParams.get("scope") === "worker" &&
      request.method === "GET" &&
      (role === "SUPER_ADMIN" || permSet.has("employee_clock") || role === "EMPLOYEE")
    ) {
      return NextResponse.next();
    }
    if (
      /^\/api\/tasks\/[^/]+\/(start|complete)$/.test(pathname) &&
      request.method === "POST" &&
      (role === "SUPER_ADMIN" ||
        permSet.has("employee_clock") ||
        permSet.has("tasks") ||
        role === "EMPLOYEE")
    ) {
      return NextResponse.next();
    }
    if (
      pathname === "/api/employees" &&
      request.method === "GET" &&
      apiUrl.searchParams.get("forTasks") === "1" &&
      (role === "SUPER_ADMIN" || permSet.has("tasks"))
    ) {
      return NextResponse.next();
    }
    if (
      pathname.startsWith("/api/payments") &&
      role !== "SUPER_ADMIN" &&
      !permSet.has("financial_registration") &&
      permSet.has("ledger")
    ) {
      return NextResponse.next();
    }
    const rule = matchRule(pathname, API_ACCESS_RULES);
    if (rule === null && role !== "SUPER_ADMIN") {
      return NextResponse.json({ ok: false, error: "אין הרשאה" }, { status: 403 });
    }
    if (rule === "SUPER_ADMIN_ONLY" && role !== "SUPER_ADMIN") {
      return NextResponse.json({ ok: false, error: "אין הרשאה" }, { status: 403 });
    }
    if (rule && rule !== "SUPER_ADMIN_ONLY" && role !== "SUPER_ADMIN" && !permSet.has(rule)) {
      return NextResponse.json({ ok: false, error: "אין הרשאה" }, { status: 403 });
    }
    return NextResponse.next();
  }

  if (pathname === "/employee/tasks" || pathname.startsWith("/employee/tasks/")) {
    if (!canAccessMyTasksPage) {
      return NextResponse.redirect(new URL("/", request.url));
    }
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
  if (pageRule && pageRule !== "SUPER_ADMIN_ONLY" && role !== "SUPER_ADMIN" && !permSet.has(pageRule)) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
