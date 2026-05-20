/** לוגים אחידים לשרשרת ההתראות — QA ודיבוג */
export function logNotificationCreated(payload: Record<string, unknown>): void {
  console.log("[NOTIFICATION CREATED]", payload);
}

export function logNotificationRead(payload: Record<string, unknown>): void {
  console.log("[NOTIFICATION READ]", payload);
}

export function logNotificationFetch(payload: Record<string, unknown>): void {
  console.log("[NOTIFICATION FETCH]", payload);
}

export function logNotificationDeduped(payload: Record<string, unknown>): void {
  console.log("[NOTIFICATION DEDUPED]", payload);
}
