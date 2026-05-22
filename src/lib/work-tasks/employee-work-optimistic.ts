import type {
  SerializedEmployeeTask,
  SerializedEmployeeTaskGroup,
  SerializedEmployeeWorkDay,
} from "@/lib/work-tasks/serialize-employee-work";

function tempId(): string {
  return `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function recomputeDayStats(day: SerializedEmployeeWorkDay): SerializedEmployeeWorkDay {
  const all: SerializedEmployeeTask[] = [
    ...day.groups.flatMap((g) => g.tasks),
    ...day.loose_tasks,
  ];
  return {
    ...day,
    task_count: all.length,
    completed_count: all.filter((t) => t.status === "COMPLETED").length,
    active_count: all.filter((t) => t.status === "IN_PROGRESS").length,
    total_minutes: all.reduce((s, t) => s + (t.estimated_minutes ?? 0), 0),
  };
}

export function mergeTaskIntoDay(
  day: SerializedEmployeeWorkDay,
  task: SerializedEmployeeTask,
): SerializedEmployeeWorkDay {
  if (task.task_group_id) {
    const groups = day.groups.map((g) => {
      if (g.id !== task.task_group_id) return g;
      return { ...g, tasks: [...g.tasks, task] };
    });
    return recomputeDayStats({ ...day, groups });
  }
  return recomputeDayStats({
    ...day,
    loose_tasks: [...day.loose_tasks, task],
  });
}

export function mergeGroupIntoDay(
  day: SerializedEmployeeWorkDay,
  group: SerializedEmployeeTaskGroup,
): SerializedEmployeeWorkDay {
  return recomputeDayStats({
    ...day,
    groups: [...day.groups, group],
  });
}

export function patchTaskInDay(
  day: SerializedEmployeeWorkDay,
  taskId: string,
  patch: Partial<SerializedEmployeeTask>,
): SerializedEmployeeWorkDay {
  const mapTask = (t: SerializedEmployeeTask) =>
    t.id === taskId ? { ...t, ...patch } : t;
  return recomputeDayStats({
    ...day,
    groups: day.groups.map((g) => ({
      ...g,
      tasks: g.tasks.map(mapTask),
    })),
    loose_tasks: day.loose_tasks.map(mapTask),
  });
}

export function removeTaskFromDay(day: SerializedEmployeeWorkDay, taskId: string): SerializedEmployeeWorkDay {
  return recomputeDayStats({
    ...day,
    groups: day.groups.map((g) => ({
      ...g,
      tasks: g.tasks.filter((t) => t.id !== taskId),
    })),
    loose_tasks: day.loose_tasks.filter((t) => t.id !== taskId),
  });
}

export function removeGroupFromDay(day: SerializedEmployeeWorkDay, groupId: string): SerializedEmployeeWorkDay {
  return recomputeDayStats({
    ...day,
    groups: day.groups.filter((g) => g.id !== groupId),
  });
}

export function reorderTasksInDay(
  day: SerializedEmployeeWorkDay,
  groupId: string | null,
  orderedIds: string[],
): SerializedEmployeeWorkDay {
  const applyOrder = (tasks: SerializedEmployeeTask[]) => {
    const byId = new Map(tasks.map((t) => [t.id, t]));
    return orderedIds.map((id, i) => {
      const t = byId.get(id);
      return t ? { ...t, order_index: i } : null;
    }).filter(Boolean) as SerializedEmployeeTask[];
  };

  if (groupId) {
    return recomputeDayStats({
      ...day,
      groups: day.groups.map((g) =>
        g.id === groupId ? { ...g, tasks: applyOrder(g.tasks) } : g,
      ),
    });
  }
  return recomputeDayStats({
    ...day,
    loose_tasks: applyOrder(day.loose_tasks),
  });
}

export function reorderGroupsInDay(
  day: SerializedEmployeeWorkDay,
  orderedGroupIds: string[],
): SerializedEmployeeWorkDay {
  const byId = new Map(day.groups.map((g) => [g.id, g]));
  const groups = orderedGroupIds
    .map((id, i) => {
      const g = byId.get(id);
      return g ? { ...g, order_index: i } : null;
    })
    .filter(Boolean) as SerializedEmployeeTaskGroup[];
  return recomputeDayStats({ ...day, groups });
}

/** optimistic task לפני תשובת שרת */
export function buildOptimisticTask(params: {
  day: SerializedEmployeeWorkDay;
  title: string;
  estimatedMinutes: number;
  taskGroupId?: string | null;
  color?: string | null;
}): SerializedEmployeeTask {
  const group = params.taskGroupId
    ? params.day.groups.find((g) => g.id === params.taskGroupId)
    : null;
  const orderIndex = group
    ? group.tasks.length
    : params.day.loose_tasks.length;

  return {
    id: tempId(),
    employee_id: params.day.employee_id,
    session_id: params.day.session_id,
    task_group_id: params.taskGroupId ?? null,
    task_template_id: null,
    title: params.title,
    description: null,
    materials: null,
    target_due_at: null,
    estimated_minutes: params.estimatedMinutes,
    started_at: null,
    completed_at: null,
    status: "PENDING",
    delay_reason: null,
    color: params.color ?? null,
    order_index: orderIndex,
    created_at: new Date().toISOString(),
  };
}

export function replaceTempTaskId(
  day: SerializedEmployeeWorkDay,
  tempId: string,
  real: SerializedEmployeeTask,
): SerializedEmployeeWorkDay {
  const swap = (t: SerializedEmployeeTask) => (t.id === tempId ? real : t);
  return recomputeDayStats({
    ...day,
    groups: day.groups.map((g) => ({ ...g, tasks: g.tasks.map(swap) })),
    loose_tasks: day.loose_tasks.map(swap),
  });
}
