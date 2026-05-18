/**
 * Serialization helpers for the new TaskGroup / TaskFile models.
 *
 * Centralised so all endpoints (list, detail, modal) return the same shape
 * regardless of which Prisma include they used. Snake_case to match the rest
 * of the API surface in this codebase.
 */

export type TaskGroupMemberDto = {
  id: string;
  user_id: string;
  full_name: string;
  email: string | null;
  role: string | null;
};

export type TaskFileDto = {
  id: string;
  group_id: string;
  title: string;
  file_url: string;
  file_name: string;
  file_type: string;
  size_bytes: number | null;
  storage_path: string | null;
  uploaded_by_id: string | null;
  uploaded_by_name: string | null;
  created_at: string;
};

export type TaskGroupSummaryDto = {
  id: string;
  title: string;
  color: string | null;
  description: string | null;
  due_date: string | null;
  status: string;
  task_count: number;
  open_task_count: number;
  completed_task_count: number;
  file_count: number;
  member_count: number;
  members: TaskGroupMemberDto[];
  created_at: string;
  updated_at: string;
};

export type TaskGroupDetailDto = TaskGroupSummaryDto & {
  files: TaskFileDto[];
};

type TaskGroupMemberRow = {
  id: string;
  userId: string;
  user?: {
    id: string;
    fullName: string;
    email: string | null;
    role: string | null;
  } | null;
};

type TaskFileRow = {
  id: string;
  groupId: string;
  title: string;
  fileUrl: string;
  fileName: string;
  fileType: string;
  sizeBytes: number | null;
  storagePath: string | null;
  uploadedById: string | null;
  uploadedBy?: { id: string; fullName: string } | null;
  createdAt: Date | string;
};

type TaskGroupRow = {
  id: string;
  title: string;
  color: string | null;
  description: string | null;
  dueDate: Date | string | null;
  status: string;
  createdAt: Date | string;
  updatedAt: Date | string;
  members?: TaskGroupMemberRow[];
  files?: TaskFileRow[];
  _count?: { tasks?: number; files?: number; members?: number };
  /// optional aggregated counts attached by caller
  openTaskCount?: number;
  completedTaskCount?: number;
};

function toIso(d: Date | string | null | undefined): string {
  if (!d) return "";
  if (d instanceof Date) return d.toISOString();
  return new Date(d).toISOString();
}

export function serializeTaskGroupMember(row: TaskGroupMemberRow): TaskGroupMemberDto {
  return {
    id: row.id,
    user_id: row.userId,
    full_name: row.user?.fullName ?? "",
    email: row.user?.email ?? null,
    role: row.user?.role ?? null,
  };
}

export function serializeTaskFile(row: TaskFileRow): TaskFileDto {
  return {
    id: row.id,
    group_id: row.groupId,
    title: row.title,
    file_url: row.fileUrl,
    file_name: row.fileName,
    file_type: row.fileType,
    size_bytes: row.sizeBytes ?? null,
    storage_path: row.storagePath ?? null,
    uploaded_by_id: row.uploadedById ?? null,
    uploaded_by_name: row.uploadedBy?.fullName ?? null,
    created_at: toIso(row.createdAt),
  };
}

export function serializeTaskGroupSummary(row: TaskGroupRow): TaskGroupSummaryDto {
  const members = (row.members ?? []).map(serializeTaskGroupMember);
  const totalTasks = row._count?.tasks ?? 0;
  return {
    id: row.id,
    title: row.title,
    color: row.color ?? null,
    description: row.description ?? null,
    due_date: row.dueDate ? toIso(row.dueDate).slice(0, 10) : null,
    status: row.status,
    task_count: totalTasks,
    open_task_count: row.openTaskCount ?? Math.max(0, totalTasks - (row.completedTaskCount ?? 0)),
    completed_task_count: row.completedTaskCount ?? 0,
    file_count: row._count?.files ?? row.files?.length ?? 0,
    member_count: row._count?.members ?? members.length,
    members,
    created_at: toIso(row.createdAt),
    updated_at: toIso(row.updatedAt),
  };
}

export function serializeTaskGroupDetail(row: TaskGroupRow): TaskGroupDetailDto {
  return {
    ...serializeTaskGroupSummary(row),
    files: (row.files ?? []).map(serializeTaskFile),
  };
}
