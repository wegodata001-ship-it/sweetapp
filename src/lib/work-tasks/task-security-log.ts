/** לוגי אבטחת משימות — תמיד ב־console (גם production) */
export function logTaskAccessAllowed(extra: Record<string, unknown>): void {
  console.log("[TASK ACCESS ALLOWED]", extra);
}

export function logTaskAccessBlocked(extra: Record<string, unknown>): void {
  console.warn("[TASK ACCESS BLOCKED]", extra);
}

export function logTaskStartDenied(extra: Record<string, unknown>): void {
  console.warn("[TASK START DENIED]", extra);
}

export function logTaskCompleteDenied(extra: Record<string, unknown>): void {
  console.warn("[TASK COMPLETE DENIED]", extra);
}
