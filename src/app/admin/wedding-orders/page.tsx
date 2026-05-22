"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { WeddingOrdersHub } from "@/components/orders/wedding-orders-hub";
import { useAuth } from "@/components/auth-provider";
import { UserRole } from "@prisma/client";

export default function WeddingOrdersPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const allowed =
    user && (user.role === UserRole.SUPER_ADMIN || user.role === UserRole.ADMIN);

  useEffect(() => {
    if (!loading && user && !allowed) {
      router.replace("/employee");
    }
  }, [loading, user, allowed, router]);

  if (loading || !user) {
    return (
      <p className="p-8 text-center text-sm font-semibold text-violet-700/70">…</p>
    );
  }

  if (!allowed) return null;

  return <WeddingOrdersHub />;
}
