/**
 * Live refresh bus on top of the existing in-memory fetch-cache.
 * GET-only revalidation — never creates payments / expenses / ledger rows.
 */

import { invalidateCache } from "@/lib/client/fetch-cache";

export const LIVE_REFRESH_EVENT = "wego:live-refresh";
export const LIVE_REFRESH_INTERVAL_MS = 30_000;

export type LiveRefreshDetail = { scope?: string };

export function signalLiveRefresh(scope = "finance"): void {
  invalidateCache(scope);
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<LiveRefreshDetail>(LIVE_REFRESH_EVENT, { detail: { scope } }),
  );
}

export function liveRefreshScopeMatches(eventScope: string | undefined, subscribed: string): boolean {
  if (!eventScope || eventScope === "*") return true;
  return eventScope === subscribed || subscribed.startsWith(`${eventScope}:`);
}
