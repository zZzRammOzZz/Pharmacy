/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["IBM Plex Sans", "Segoe UI", "sans-serif"],
      },
      colors: {
        ink: "#17211c",
        muted: "#5c6b63",
        moss: "#0f6b4c",
        mossdeep: "#0c3d2e",
        canvas: "#f3f5f4",
        line: "#dfe3e1",
      },
    },
  },
  plugins: [],
};
