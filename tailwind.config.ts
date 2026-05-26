import type { Config } from "tailwindcss";
import forms from "@tailwindcss/forms";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#101114",
          900: "#181a1f",
          800: "#23262d",
          700: "#333842",
          600: "#555d6b",
          500: "#737b8c",
          300: "#c4c9d3",
          200: "#dfe3ea",
          100: "#f1f3f7",
          50: "#f8f9fb"
        },
        signal: {
          green: "#1f8a5b",
          red: "#b42318",
          amber: "#a15c07",
          blue: "#2563eb"
        },
        luxury: {
          graphite: "#111318",
          panel: "#171a21",
          gold: "#c9a227",
          mint: "#25a978",
          pearl: "#fbfcf8"
        }
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "SFMono-Regular", "monospace"]
      },
      boxShadow: {
        hairline: "inset 0 0 0 1px rgba(16, 17, 20, 0.08)",
        elevated: "0 18px 50px rgba(17, 19, 24, 0.08)"
      }
    }
  },
  plugins: [forms]
};

export default config;
