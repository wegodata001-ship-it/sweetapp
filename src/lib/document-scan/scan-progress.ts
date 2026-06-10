export type ScanProgressPhase = "upload" | "preprocess" | "ai" | "parse";

export const SCAN_PROGRESS_ORDER: ScanProgressPhase[] = [
  "upload",
  "preprocess",
  "ai",
  "parse",
];

export type ScanProgressCallback = (phase: ScanProgressPhase) => void;
