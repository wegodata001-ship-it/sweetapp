/** Pastel gradient presets for task group cards (mobile-first cards UI). */

export type CardGradient = {
  from: string;
  to: string;
  accent: string;
  className: string;
};

export const CARD_GRADIENTS: CardGradient[] = [
  { from: "#fda4af", to: "#fdba74", accent: "#e11d48", className: "tcg-grad-0" },
  { from: "#93c5fd", to: "#c4b5fd", accent: "#2563eb", className: "tcg-grad-1" },
  { from: "#6ee7b7", to: "#67e8f9", accent: "#059669", className: "tcg-grad-2" },
  { from: "#fde047", to: "#fb923c", accent: "#ca8a04", className: "tcg-grad-3" },
  { from: "#f9a8d4", to: "#a5b4fc", accent: "#9333ea", className: "tcg-grad-4" },
  { from: "#bef264", to: "#86efac", accent: "#65a30d", className: "tcg-grad-5" },
];

const HEX = /^#?([0-9a-f]{6})$/i;

function hexToRgb(hex: string): [number, number, number] | null {
  const m = HEX.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Pick a stable gradient from template color or index. */
export function gradientForCard(color: string | null | undefined, index: number): CardGradient {
  if (color) {
    const rgb = hexToRgb(color);
    if (rgb) {
      const [r, g, b] = rgb;
      const from = `rgb(${Math.min(255, r + 80)} ${Math.min(255, g + 80)} ${Math.min(255, b + 80)})`;
      const to = `rgb(${Math.min(255, r + 40)} ${Math.min(255, g + 40)} ${Math.min(255, b + 100)})`;
      return {
        from,
        to,
        accent: color,
        className: CARD_GRADIENTS[index % CARD_GRADIENTS.length].className,
      };
    }
  }
  return CARD_GRADIENTS[index % CARD_GRADIENTS.length];
}

export type GradientStyle = {
  background: string;
};

export function gradientStyle(g: CardGradient): GradientStyle {
  return {
    background: `linear-gradient(145deg, ${g.from} 0%, ${g.to} 100%)`,
  };
}
