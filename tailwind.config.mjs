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
        darkerGrote: ["Darker Grotesque", "sans-serif"],
        montserrat: ["Montserrat", "sans-serif"],
        roboto: ["Roboto", "sans-serif"],
      },
    },
  },
  plugins: [],
};
