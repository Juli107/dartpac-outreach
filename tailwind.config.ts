import type { Config } from "tailwindcss";

// Dartpac Premium: azul marino en degradé, vidrio esmerilado y un acento azul cielo.
// Un solo tema oscuro, elegido a propósito (el mismo del Radar comercial).
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: "#0B2545", 700: "#13315C", 800: "#081C38", 900: "#06152B", 950: "#030A17", 50: "#E8EEF7" },
        brand: { DEFAULT: "#4DA3FF", 2: "#8CC9FF", deep: "#2F7BF6", soft: "#173A66" },
        ink: "#F3F7FD",
        muted: "#A6B9D5",
        faint: "#869FC4",
        line: "#26406A",
        canvas: "#06152B",
        go: "#34C759",
        ok: "#3DDC97",
        warn: "#FFC861",
        bad: "#FF6F6F",
        wa: "#25D366",
      },
      fontFamily: {
        display: ["-apple-system", "BlinkMacSystemFont", "SF Pro Display", "Inter", "Segoe UI", "system-ui", "sans-serif"],
        sans: ["-apple-system", "BlinkMacSystemFont", "SF Pro Text", "Inter", "Segoe UI", "system-ui", "sans-serif"],
        mono: ["SF Mono", "ui-monospace", "Menlo", "Consolas", "monospace"],
      },
      boxShadow: {
        soft: "0 12px 28px -18px rgba(0,0,0,.65), inset 0 1px 0 rgba(255,255,255,.05)",
        lift: "0 30px 60px -32px rgba(0,0,0,.8), inset 0 1px 0 rgba(255,255,255,.07)",
        glow: "0 8px 22px -10px rgba(28,102,228,.85)",
      },
      transitionTimingFunction: {
        dp: "cubic-bezier(.2,.8,.2,1)",
        spring: "cubic-bezier(.34,1.4,.64,1)",
      },
    },
  },
  plugins: [],
} satisfies Config;
