import type { Config } from "tailwindcss";

/**
 * Enterprise luxury theme: charcoal/navy chrome, gold accents, elevated surfaces.
 * Used with Tailwind v4 via `@config` in src/app/globals.css.
 */
const config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        luxury: {
          gold: "#D4AF37",
          "gold-hover": "#c9a227",
          charcoal: "#1a1f2e",
          navy: "#121a26",
          "navy-rich": "#1a2332",
          "navy-deep": "#0f1419",
        },
      },
      boxShadow: {
        luxury:
          "0 4px 28px -6px rgba(15, 23, 42, 0.14), 0 2px 12px -4px rgba(15, 23, 42, 0.08)",
        "luxury-sm":
          "0 2px 14px -4px rgba(15, 23, 42, 0.1), 0 1px 4px -2px rgba(15, 23, 42, 0.06)",
      },
      fontSize: {
        xs: ["0.8125rem", { lineHeight: "1.35rem" }],
        sm: ["0.9375rem", { lineHeight: "1.55rem" }],
        base: ["1.0625rem", { lineHeight: "1.75rem" }],
        lg: ["1.1875rem", { lineHeight: "1.85rem" }],
        xl: ["1.3125rem", { lineHeight: "2rem" }],
        "2xl": ["1.5rem", { lineHeight: "2.125rem" }],
        "3xl": ["1.875rem", { lineHeight: "2.35rem" }],
        "4xl": ["2.25rem", { lineHeight: "2.75rem" }],
      },
    },
  },
} satisfies Config;

export default config;
