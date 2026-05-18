/**
 * Reuse one Tesseract worker per server instance (warm Vercel lambdas).
 * Creating a worker per request downloads lang data again (~15–30s).
 */
import type { Worker } from "tesseract.js";

type WorkerGlobals = {
  __wegoOcrWorker?: Promise<Worker>;
};

const g = globalThis as WorkerGlobals;

async function createSharedWorker(): Promise<Worker> {
  const { createWorker, PSM } = await import("tesseract.js");
  console.log("[OCR] Initializing shared Tesseract worker (heb+eng+ara)…");
  const worker = await createWorker("heb+eng+ara", 1, {
    logger: () => undefined,
  });
  await worker.setParameters({
    preserve_interword_spaces: "1",
    tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
    tessedit_do_invert: "0",
  });
  console.log("[OCR] Shared Tesseract worker ready");
  return worker;
}

export function getSharedOcrWorker(): Promise<Worker> {
  if (!g.__wegoOcrWorker) {
    g.__wegoOcrWorker = createSharedWorker();
  }
  return g.__wegoOcrWorker;
}
