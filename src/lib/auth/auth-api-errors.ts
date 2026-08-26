import { NextResponse } from "next/server";

/** קודים בטוחים ללקוח — ללא פרטים טכניים */
export const AUTH_API_CODES = {
  REQUIRED_FIELDS: "REQUIRED_FIELDS",
  INVALID_CREDENTIALS: "INVALID_CREDENTIALS",
  ACCOUNT_DISABLED: "ACCOUNT_DISABLED",
  SYSTEM_ERROR: "SYSTEM_ERROR",
} as const;

export type AuthApiCode = (typeof AUTH_API_CODES)[keyof typeof AUTH_API_CODES];

export function authErrorResponse(code: AuthApiCode, status: number) {
  return NextResponse.json({ ok: false, code }, { status });
}

/** זיהוי שגיאות DB/Prisma — לא לחשוף ללקוח */
export function isInfrastructureError(error: unknown): boolean {
  if (!error) return false;
  const msg = error instanceof Error ? error.message : String(error);
  const name = error instanceof Error ? error.name : "";
  const combined = `${name} ${msg}`.toLowerCase();
  return (
    /prisma/i.test(combined) ||
    /database_url|direct_url/i.test(combined) ||
    /environment variable not found/i.test(combined) ||
    /can't reach database|connection refused|connection timed out|econnrefused/i.test(
      combined,
    ) ||
    /p1001|p1000|p1017|p2024/i.test(combined) ||
    /\.next[/\\]|schema\.prisma|c:\\|c:\/|validation error/i.test(combined)
  );
}

export function logAuthApiError(scope: string, error: unknown): void {
  console.error(`[${scope}]`, error);
}

export function handleAuthApiCatch(scope: string, error: unknown) {
  logAuthApiError(scope, error);
  return authErrorResponse(AUTH_API_CODES.SYSTEM_ERROR, 500);
}
