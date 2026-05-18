/** Per-step timing in Vercel logs (console.time/timeEnd). */
export async function timeStep<T>(label: string, fn: () => Promise<T>): Promise<T> {
  console.time(label);
  try {
    return await fn();
  } finally {
    console.timeEnd(label);
  }
}
