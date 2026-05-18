/**
 * One Tesseract worker per serverless instance — globalThis.ocrWorker.
 * heb+eng only (ara removed — 3 langs timeout on Vercel Hobby).
 */
import type { Worker } from "tesseract.js";

const LANGS = "heb+eng";

type WorkerGlobals = typeof globalThis & {
  ocrWorker?: Promise<Worker>;
};

const g = globalThis as WorkerGlobals;

async function createSharedWorker(): Promise<Worker> {
  const initStart = Date.now();
  const { createWorker, PSM } = await import("tesseract.js");
  console.log(`[OCR] Initializing shared Tesseract worker (${LANGS})…`);

  const worker = await createWorker(LANGS, 1, {
    logger: () => undefined,
  });

  await worker.setParameters({
    preserve_interword_spaces: "1",
    tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
    tessedit_do_invert: "0",
  });

  const initMs = Date.now() - initStart;
  console.log(`[OCR] worker init time: ${initMs}ms`);

  if (initMs > 10_000) {
    console.warn(
      "[OCR] worker init slow (>10s) — globalThis.ocrWorker kept for this runtime (warm requests skip re-init)",
    );
  } else {
    console.log("[OCR] Shared Tesseract worker ready");
  }

  return worker;
}

/** Singleton — never createWorker per request. */
export function getSharedOcrWorker(): Promise<Worker> {
  if (!g.ocrWorker) {
    g.ocrWorker = createSharedWorker();
  }
  return g.ocrWorker;
}
