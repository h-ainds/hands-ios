/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    fontSize: {
      xs: 12,
      sm: 14,
      base: 16,
      lg: 18,
      xl: 20,
      "2xl": 24,
      "2.5xl": 28,
      "3xl": 30,
      "4xl": 36,
      "5xl": 48,
      "6xl": 60,
    },
    extend: {
      colors: {
        primary: {
          DEFAULT: "#6CD401",
          highlight: "#98E14D",
          muted: "#F0FBE5",
        },
        secondary: {
          DEFAULT: "#F7F7F7",
          muted: "#B2B2B2",
          placeholder: "#9F9F9F",
          active: "#58575C",
        },
        red: "#FE303F",
      },
      backgroundImage: {
        "primary-gradient": "linear-gradient(90deg, #6ED308 0%, #A5E765 100%)",
      },
      boxShadow: {
        hands: '0 2px 18px 0 rgba(0, 0, 0, 0.06)',
      },
    },
  },
  plugins: [],
};