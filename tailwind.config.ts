import type { Config } from "tailwindcss";

// Paleta Dartpac: azul marino como color de marca.
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: "#0B2545", 700: "#13315C", 50: "#E8EEF7" },
        brand: { DEFAULT: "#1F6FD1", soft: "#E3EDFB" },
        ink: "#14213D",
        muted: "#5B6B82",
        line: "#DCE3EC",
        canvas: "#F3F6FA",
      },
      fontFamily: {
        display: ["Manrope", "system-ui", "sans-serif"],
        sans: ["IBM Plex Sans", "system-ui", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;
