import { redirect } from "next/navigation";

/** תאימות לאחור — מפנה להזמנות יומיות */
export default function FutureOrdersRedirectPage() {
  redirect("/admin/daily-orders");
}
