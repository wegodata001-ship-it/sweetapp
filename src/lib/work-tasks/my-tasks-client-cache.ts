import type { EmployeeTaskDayStats } from "@/lib/employee-experience/task-stats";
import type { SerializedWorkEmployeeTask } from "@/lib/work-tasks/serialize-work-task";
import type { MyTasksListPage } from "@/lib/work-tasks/my-tasks-snapshot";

export const EMPLOYEE_TASKS_CACHE_KEY = "wego:employee-tasks-cache";
/** Short enough that a finished task is not shown as open for long after a refresh. */
export const EMPLOYEE_TASKS_CACHE_TTL_MS = 20_000;

export type EmployeeTasksCachePayload = {
  open?: MyTasksListPage;
  completed?: MyTasksListPage;
  totals?: { open: number; completed_today: number };
  stats?: EmployeeTaskDayStats;
  data?: SerializedWorkEmployeeTask[];
  shift?: { clock_in: string } | null;
  today?: { completed_minutes: number };
  auto_closed?: boolean;
  shift_open?: boolean;
};

type CacheEntry = {
  userId: string;
  savedAt: number;
  payload: EmployeeTasksCachePayload;
};

export function readEmployeeTasksCache(
  userId: string,
  now = Date.now(),
): EmployeeTasksCachePayload | null {
  if (typeof sessionStorage === "undefined" || !userId) return null;
  try {
    const raw = sessionStorage.getItem(EMPLOYEE_TASKS_CACHE_KEY);
    if (!raw) return null;
    const entry = JSON.parse(raw) as CacheEntry;
    if (entry.userId !== userId) return null;
    if (!Number.isFinite(entry.savedAt) || now - entry.savedAt > EMPLOYEE_TASKS_CACHE_TTL_MS) {
      return null;
    }
    return entry.payload ?? null;
  } catch {
    return null;
  }
}

export function writeEmployeeTasksCache(userId: string, payload: EmployeeTasksCachePayload): void {
  if (typeof sessionStorage === "undefined" || !userId) return;
  try {
    const entry: CacheEntry = { userId, savedAt: Date.now(), payload };
    sessionStorage.setItem(EMPLOYEE_TASKS_CACHE_KEY, JSON.stringify(entry));
  } catch {
    /* quota / private mode */
  }
}

export function invalidateEmployeeTasksCache(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(EMPLOYEE_TASKS_CACHE_KEY);
  } catch {
    /* */
  }
}
