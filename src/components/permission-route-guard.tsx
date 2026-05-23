"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/components/auth-provider";
import { canAccessPath, unauthorizedRedirectPath } from "@/lib/auth/can-access-path";

/**
 * מפנה משתמשים לדף הבית/עובד כשאין הרשאה למסך הנוכחי
 * (למשל אחרי שהמנהל הסיר הרשאה בזמן שהעובד עדיין בדף).
 */
export function PermissionRouteGuard() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading || !user) return;
    if (!canAccessPath(pathname, user.role, user.permissions)) {
      router.replace(unauthorizedRedirectPath(user.role));
    }
  }, [loading, user, pathname, router]);

  return null;
}
