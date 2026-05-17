/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}"],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#7564cc",
          50: "#9571D5",
          100: "#241265",
          150: "#1e1265",
          200: "#0B0800",
        },
      },
      fontFamily: {
        sans: ["Geist Mono", "IBM Plex Mono", "Roboto Mono", "ui-monospace", "monospace"],
        mono: ["Geist Mono", "IBM Plex Mono", "Roboto Mono", "ui-monospace", "monospace"],
        geist: ["Geist Mono", "ui-monospace", "monospace"],
        geistMono: ["Geist Mono", "ui-monospace", "monospace"],
        ibmPlex: ["IBM Plex Mono", "ui-monospace", "monospace"],
        ibmPlexMono: ["IBM Plex Mono", "ui-monospace", "monospace"],
        robotoMono: ["Roboto Mono", "ui-monospace", "monospace"],
        darkerGrote: ["Geist Mono", "ui-monospace", "monospace"],
        montserrat: ["IBM Plex Mono", "ui-monospace", "monospace"],
        roboto: ["Roboto Mono", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};
