/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
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
        background: "#FFFFFF",
        muted: "#F7F7F7",
        red: "#FE303F",
      },
      backgroundImage: {
        "primary-gradient": "linear-gradient(90deg, #6ED308 0%, #A5E765 100%)",
      },
    },
  },
  plugins: [],
};
