/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Plus Jakarta Sans", "Segoe UI", "sans-serif"],
      },
      borderRadius: {
        sm: "10px",
        DEFAULT: "12px",
        md: "14px",
        lg: "16px",
        xl: "20px",
      },
      boxShadow: {
        card: "0 0 0 1px rgba(255,255,255,0.03), 0 16px 40px rgba(0,0,0,0.28)",
      },
      colors: {
        ink: "#e7f2ec",
        muted: "#93a69d",
        moss: "#3dbe8a",
        mossdeep: "#d7ffe8",
        canvas: "#0c1210",
        surface: "#171f1c",
        line: "#2a3832",
      },
    },
  },
  plugins: [],
};
