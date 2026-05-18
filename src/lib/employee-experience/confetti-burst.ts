export type ConfettiStrength = "welcome" | "task" | "group";

const PALETTE = ["#22c55e", "#16a34a", "#3b82f6", "#facc15", "#86efac"];

/**
 * confetti קל — נטען דינמית כדי לא לשבור SSR.
 */
export async function fireEmployeeConfetti(strength: ConfettiStrength): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const confetti = (await import("canvas-confetti")).default;
    const base = {
      colors: PALETTE,
      disableForReducedMotion: true,
      ticks: strength === "group" ? 200 : strength === "task" ? 160 : 130,
      gravity: 1.05,
      scalar: strength === "group" ? 0.95 : 0.85,
    };
    if (strength === "welcome") {
      void confetti({
        ...base,
        particleCount: 48,
        spread: 46,
        startVelocity: 16,
        origin: { x: 0.5, y: 0.32 },
      });
      return;
    }
    if (strength === "task") {
      void confetti({
        ...base,
        particleCount: 85,
        spread: 58,
        startVelocity: 22,
        origin: { x: 0.5, y: 0.38 },
      });
      return;
    }
    void confetti({
      ...base,
      particleCount: 120,
      spread: 70,
      startVelocity: 26,
      origin: { x: 0.5, y: 0.28 },
    });
    window.setTimeout(() => {
      void confetti({
        ...base,
        particleCount: 70,
        spread: 55,
        startVelocity: 18,
        origin: { x: 0.18, y: 0.55 },
      });
    }, 200);
    window.setTimeout(() => {
      void confetti({
        ...base,
        particleCount: 70,
        spread: 55,
        startVelocity: 18,
        origin: { x: 0.82, y: 0.55 },
      });
    }, 400);
  } catch {
    /* ללא confetti אם החבילה נכשלת */
  }
}
