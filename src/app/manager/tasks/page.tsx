import { redirect } from "next/navigation";

/**
 * תצוגת מנהל — overview בלבד (לא פורטל עובד).
 * מפנה ללוח ניהול המשימות הקיים.
 */
export default function ManagerTasksPage() {
  redirect("/admin/tasks");
}
