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

export const FLOATING_MENU_Z = 9999;
