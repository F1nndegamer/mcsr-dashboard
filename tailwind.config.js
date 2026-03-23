/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'minecraft-gold': '#ffaa00',
        'minecraft-green': '#55ff55',
      },
    },
  },
  plugins: [],
}