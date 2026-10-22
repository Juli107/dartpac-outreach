import type { Config } from "tailwindcss";

// Paleta Dartpac (azul marino de marca) con neutros y superficies al estilo de Apple.
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: "#0B2545", 700: "#13315C", 50: "#E8EEF7" },
        brand: { DEFAULT: "#0A66D8", soft: "#E8F1FD" },
        ink: "#1D1D1F",
        muted: "#6E6E73",
        line: "#E5E5EA",
        canvas: "#F5F5F7",
        go: "#34C759",
      },
      fontFamily: {
        display: ["-apple-system", "BlinkMacSystemFont", "SF Pro Display", "Inter", "Segoe UI", "system-ui", "sans-serif"],
        sans: ["-apple-system", "BlinkMacSystemFont", "SF Pro Text", "Inter", "Segoe UI", "system-ui", "sans-serif"],
        mono: ["SF Mono", "ui-monospace", "Menlo", "Consolas", "monospace"],
      },
      boxShadow: {
        soft: "0 1px 2px rgba(0,0,0,.04), 0 6px 24px -8px rgba(0,0,0,.08)",
        lift: "0 2px 6px rgba(0,0,0,.05), 0 18px 40px -12px rgba(0,0,0,.18)",
      },
    },
  },
  plugins: [],
} satisfies Config;
