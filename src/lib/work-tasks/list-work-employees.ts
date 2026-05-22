import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { invalidateEmployeeAssigneeCache } from "@/lib/work-tasks/employee-assignee-cache";

export type WorkEmployeeRow = {
  /** מזהה כרטיס Employee — משמש ל-employee-work API */
  id: string;
  name: string;
  userId: string;
  role: string;
};

/**
 * כל מי שיכול לקבל סדר עבודה: עובד, מנהל, super admin.
 * מבטיח Employee.id מקושר לכל User.
 */
export async function listEmployeesForWorkOrder(): Promise<WorkEmployeeRow[]> {
  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      role: { in: [UserRole.EMPLOYEE, UserRole.ADMIN, UserRole.SUPER_ADMIN] },
    },
    orderBy: { fullName: "asc" },
    select: { id: true, fullName: true, role: true, employeeId: true },
  });

  const rows: WorkEmployeeRow[] = [];

  for (const u of users) {
    let employeeId = u.employeeId;
    if (!employeeId) {
      const created = await prisma.employee.create({
        data: { name: (u.fullName || "עובד").trim() },
      });
      await prisma.user.update({
        where: { id: u.id },
        data: { employeeId: created.id },
      });
      employeeId = created.id;
      invalidateEmployeeAssigneeCache();
    }
    rows.push({
      id: employeeId,
      name: u.fullName.trim() || "—",
      userId: u.id,
      role: u.role,
    });
  }

  return rows;
}
