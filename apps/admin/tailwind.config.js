/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["IBM Plex Sans", "Segoe UI", "sans-serif"],
        serif: ["IBM Plex Serif", "Georgia", "serif"],
      },
      colors: {
        paper: "#f3f0e8",
        panel: "#f7f4ee",
        ink: "#1c1917",
        line: "#e4ddd0",
        moss: "#1f6b4a",
        mossdeep: "#164e36",
      },
    },
  },
  plugins: [],
};
