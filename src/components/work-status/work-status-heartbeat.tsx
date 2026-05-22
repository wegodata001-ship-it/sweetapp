"use client";

import { useEffect } from "react";

const HEARTBEAT_MS = 25_000;

/** שולח heartbeat לנוכחות LIVE */
export function WorkStatusHeartbeat({ enabled = true }: { enabled?: boolean }) {
  useEffect(() => {
    if (!enabled) return;
    const ping = () => {
      void fetch("/api/work-status/heartbeat", { method: "POST", credentials: "same-origin" });
    };
    ping();
    const t = setInterval(ping, HEARTBEAT_MS);
    return () => clearInterval(t);
  }, [enabled]);
  return null;
}
