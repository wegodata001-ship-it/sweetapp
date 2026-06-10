"use client";

import { useEffect, useState } from "react";

const ROTATE_MS = 2800;

export function useScanRotatingMessage(
  active: boolean,
  messageKeys: string[],
  t: (key: string) => string,
): string {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!active) {
      setIndex(0);
      return;
    }
    const id = window.setInterval(() => {
      setIndex((prev) => (prev + 1) % messageKeys.length);
    }, ROTATE_MS);
    return () => window.clearInterval(id);
  }, [active, messageKeys.length]);

  const key = messageKeys[index] ?? messageKeys[0] ?? "";
  return key ? t(key) : "";
}

export const SCAN_STATUS_MESSAGE_KEYS = [
  "scan.statusMessage1",
  "scan.statusMessage2",
  "scan.statusMessage3",
  "scan.statusMessage4",
] as const;
