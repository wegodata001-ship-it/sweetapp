export const NOTIFICATIONS_REFRESH_EVENT = "wego:notifications-refresh";

export function dispatchNotificationsRefresh(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(NOTIFICATIONS_REFRESH_EVENT));
}
