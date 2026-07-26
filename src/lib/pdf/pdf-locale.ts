import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { WEGO_LOCALE_COOKIE, normalizeLocale, type AppLocale } from "@/lib/i18n/constants";

/**
 * The language a generated PDF should use: the logged-in user's own language.
 *
 * The locale cookie is checked first because it is what the user last chose in the UI, then
 * the persisted `user.language`. A PDF must never fail over a language lookup, so any
 * problem falls back to the default locale.
 */
export async function resolvePdfLocale(explicit?: string | null): Promise<AppLocale> {
  if (explicit) return normalizeLocale(explicit);

  try {
    const cookieValue = (await cookies()).get(WEGO_LOCALE_COOKIE)?.value;
    if (cookieValue) return normalizeLocale(cookieValue);
  } catch {
    // Not in a request scope (background job) — fall through to the user record.
  }

  try {
    const session = await getSessionFromCookie();
    if (session?.sub) {
      const user = await prisma.user.findUnique({
        where: { id: session.sub },
        select: { language: true },
      });
      if (user?.language) return normalizeLocale(user.language);
    }
  } catch {
    // Ignore and use the default.
  }

  return normalizeLocale(null);
}

/** Locale for a background job, where no request cookies exist. */
export async function resolvePdfLocaleForUser(
  userId: string | null | undefined,
): Promise<AppLocale> {
  if (!userId) return normalizeLocale(null);
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { language: true },
    });
    return normalizeLocale(user?.language ?? null);
  } catch {
    return normalizeLocale(null);
  }
}
