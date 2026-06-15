/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        mono: ["JetBrains Mono", "IBM Plex Mono", "Fira Code", "Courier New", "monospace"],
      },
      colors: {
        "pf-black":   "#0a0a0a",
        "pf-yellow":  "#ffd600",
        "pf-green":   "#00d26a",
        "pf-red":     "#ff3b3b",
        "pf-orange":  "#ff7c2a",
        "pf-muted":   "#666666",
        "pf-border":  "#222222",
        "pf-surface": "#111111",
        "pf-surface2":"#161616",
      },
    },
  },
  plugins: [],
};
