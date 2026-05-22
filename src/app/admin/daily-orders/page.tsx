"use client";

import { OrdersHub } from "@/components/orders/orders-hub";

export default function DailyOrdersPage() {
  return <OrdersHub module="daily" canManage />;
}
