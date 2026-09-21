"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  LIVE_REFRESH_EVENT,
  LIVE_REFRESH_INTERVAL_MS,
  liveRefreshScopeMatches,
  type LiveRefreshDetail,
} from "@/lib/client/live-data";

export type LiveRefreshUiStatus = "idle" | "refreshing" | "updated" | "error";

type Options = {
  /** GET refresh — must not mutate server state */
  refresh: () => void | Promise<void>;
  /** Skip polling / focus refresh while a draft or count modal is open */
  paused?: boolean;
  intervalMs?: number;
  scope?: string;
  enabled?: boolean;
};

/**
 * Revalidates query data on interval, tab focus, and mutation signals.
 * Does not call window.location.reload().
 */
export function useLiveRefresh({
  refresh,
  paused = false,
  intervalMs = LIVE_REFRESH_INTERVAL_MS,
  scope = "finance",
  enabled = true,
}: Options): { requestRefresh: () => void; status: LiveRefreshUiStatus } {
  const refreshRef = useRef(refresh);
  const pausedRef = useRef(paused);
  const inflightRef = useRef(false);
  const skipMountUnpauseRef = useRef(true);
  const [status, setStatus] = useState<LiveRefreshUiStatus>("idle");

  useEffect(() => {
    refreshRef.current = refresh;
    pausedRef.current = paused;
  }, [refresh, paused]);

  const requestRefresh = useCallback(() => {
    if (!enabled) return;
    if (pausedRef.current) return;
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    if (inflightRef.current) return;
    inflightRef.current = true;
    setStatus("refreshing");
    void Promise.resolve(refreshRef.current())
      .then(() => {
        setStatus("updated");
      })
      .catch(() => {
        setStatus("error");
      })
      .finally(() => {
        inflightRef.current = false;
      });
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(requestRefresh, intervalMs);
    return () => window.clearInterval(id);
  }, [enabled, intervalMs, requestRefresh]);

  useEffect(() => {
    if (!enabled) return;

    const onVisibility = () => {
      if (document.visibilityState === "visible") requestRefresh();
    };
    const onFocus = () => requestRefresh();
    const onSignal = (event: Event) => {
      const detail = (event as CustomEvent<LiveRefreshDetail>).detail;
      if (!liveRefreshScopeMatches(detail?.scope, scope)) return;
      requestRefresh();
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);
    window.addEventListener(LIVE_REFRESH_EVENT, onSignal);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener(LIVE_REFRESH_EVENT, onSignal);
    };
  }, [enabled, requestRefresh, scope]);

  useEffect(() => {
    if (!enabled) return;
    if (skipMountUnpauseRef.current) {
      skipMountUnpauseRef.current = false;
      return;
    }
    if (!paused) requestRefresh();
  }, [paused, enabled, requestRefresh]);

  return { requestRefresh, status };
}
