import type { SessionJwtPayload } from "@/lib/auth/jwt";
import { UserRole } from "@prisma/client";
import { ORDER_CATEGORY_WEDDING } from "@/lib/future-orders/helpers";

function permSet(session: SessionJwtPayload): Set<string> {
  return new Set(session.permissions ?? []);
}

/** הזמנות יומיות — כל משתמש מחובר */
export function canViewDailyOrders(_session: SessionJwtPayload): boolean {
  return true;
}

export function canManageDailyOrders(_session: SessionJwtPayload): boolean {
  return true;
}

/** הזמנות חתונות — מנהלים בלבד (ADMIN / SUPER_ADMIN) */
export function canViewWeddingOrders(session: SessionJwtPayload): boolean {
  return session.role === UserRole.SUPER_ADMIN || session.role === UserRole.ADMIN;
}

export function canManageWeddingOrders(session: SessionJwtPayload): boolean {
  return canViewWeddingOrders(session);
}

export function canManageOrderCategory(
  session: SessionJwtPayload,
  category: string,
): boolean {
  if (category === ORDER_CATEGORY_WEDDING) return canManageWeddingOrders(session);
  return canManageDailyOrders(session);
}

/** @deprecated */
export function canManageFutureOrders(session: SessionJwtPayload): boolean {
  return session.role === UserRole.SUPER_ADMIN || session.role === UserRole.ADMIN;
}

/** @deprecated */
export function canViewFutureOrders(session: SessionJwtPayload): boolean {
  return canViewDailyOrders(session) || canViewWeddingOrders(session);
}
