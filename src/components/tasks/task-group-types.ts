import type { TaskGroupDetailDto as ApiTaskGroupDetailDto, TaskGroupMemberDto } from "@/lib/task-files/serialize";

/** Modal detail includes tasks[] — compatible with API detail for summary extraction */
type TaskGroupDetailLike = ApiTaskGroupDetailDto & { tasks?: unknown[] };

/** List card shape — mirrors API summary DTO */
export type TaskGroupSummary = {
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

export type TaskGroupChangeEvent =
  | { type: "updated"; summary: TaskGroupSummary }
  | { type: "deleted"; id: string }
  | { type: "refresh" };

export function buildOptimisticGroup(
  title: string,
  color: string,
  dueDate: string,
  tempId: string,
): TaskGroupSummary {
  const now = new Date().toISOString();
  return {
    id: tempId,
    title,
    color: color || null,
    description: null,
    due_date: dueDate || null,
    status: "ACTIVE",
    task_count: 0,
    open_task_count: 0,
    completed_task_count: 0,
    file_count: 0,
    member_count: 1,
    members: [],
    created_at: now,
    updated_at: now,
  };
}

export function detailToSummary(d: TaskGroupDetailLike): TaskGroupSummary {
  return {
    id: d.id,
    title: d.title,
    color: d.color,
    description: d.description,
    due_date: d.due_date,
    status: d.status,
    task_count: d.task_count,
    open_task_count: d.open_task_count,
    completed_task_count: d.completed_task_count,
    file_count: d.file_count,
    member_count: d.member_count,
    members: d.members,
    created_at: d.created_at,
    updated_at: d.updated_at,
  };
}
