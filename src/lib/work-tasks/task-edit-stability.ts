/**
 * Edit-task open/load guards. Fetch and form reset must key off a stable id,
 * never a new task/detail object created on each parent render.
 */

export function shouldInitTaskEditForm(
  open: boolean,
  taskId: string | null | undefined,
  lastInitializedId: string | null,
): boolean {
  if (!open) return false;
  if (!taskId) return false;
  return taskId !== lastInitializedId;
}

export function shouldFetchTaskDetail(opts: {
  id: string | null | undefined;
  hasData: boolean;
  inFlightId: string | null;
}): boolean {
  const id = opts.id?.trim() ?? "";
  if (!id) return false;
  if (opts.hasData) return false;
  if (opts.inFlightId === id) return false;
  return true;
}

export function formatTaskDueInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(11, 16);
}
