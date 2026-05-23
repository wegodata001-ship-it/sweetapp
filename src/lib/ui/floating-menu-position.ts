const GAP = 6;

export type FloatingMenuRect = {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
};

export function computeFloatingMenuRect(
  anchor: HTMLElement,
  dir: "rtl" | "ltr",
  opts?: { minWidth?: number; maxHeight?: number },
): FloatingMenuRect {
  const rect = anchor.getBoundingClientRect();
  const pad = 8;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const minW = opts?.minWidth ?? 240;
  const maxH = opts?.maxHeight ?? 320;
  const width = Math.min(Math.max(rect.width, minW), vw - pad * 2);
  const spaceBelow = vh - rect.bottom - GAP;
  const spaceAbove = rect.top - GAP;
  const openBelow = spaceBelow >= 120 || spaceBelow >= spaceAbove;
  const maxHeight = Math.min(maxH, Math.max(100, (openBelow ? spaceBelow : spaceAbove) - pad));
  const top = openBelow ? rect.bottom + GAP : Math.max(pad, rect.top - GAP - maxHeight);
  let left = dir === "rtl" ? rect.right - width : rect.left;
  left = Math.max(pad, Math.min(left, vw - width - pad));
  return { top, left, width, maxHeight };
}

/** מיקום dropdown בגובה קבוע (תפריט פעולות ⋮) — נפתח למעלה כשאין מקום למטה */
export type DropdownMenuPosition = {
  top: number;
  left: number;
  width: number;
  openAbove: boolean;
};

export function computeDropdownMenuPosition(
  anchor: HTMLElement,
  dir: "rtl" | "ltr",
  opts: { width: number; estimatedHeight: number; gap?: number },
): DropdownMenuPosition {
  const gap = opts.gap ?? 4;
  const pad = 8;
  const rect = anchor.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = opts.width;
  const menuH = opts.estimatedHeight;
  const spaceBelow = vh - rect.bottom - gap;
  const spaceAbove = rect.top - gap;
  const openAbove = spaceBelow < menuH && spaceAbove >= spaceBelow;

  const top = openAbove
    ? Math.max(pad, rect.top - gap - menuH)
    : rect.bottom + gap;

  let left = dir === "rtl" ? rect.right - width : rect.left;
  left = Math.max(pad, Math.min(left, vw - width - pad));

  return { top, left, width, openAbove };
}

export const FLOATING_MENU_Z = 9999;
