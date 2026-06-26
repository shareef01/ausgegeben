/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,tsx,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#ffffff',
        surface: '#f8f8f8',
        primary: '#000000',
        income: '#4caf50',
        expense: '#f44336',
        transfer: '#9e9e9e',
        'on-background': '#000000',
        'on-surface': '#1c1b1f',
        'on-surface-variant': '#49454f',
        'surface-variant': '#e7e0ec',
        divider: '#e0e0e0',
      },
      borderRadius: {
        'xl': '24px',
        '2xl': '28px',
        'pill': '100px',
      },
      spacing: {
        'xxs': '4px',
        'xs': '8px',
        'sm': '12px',
        'md': '16px',
        'lg': '24px',
        'xl': '32px',
      }
    },
  },
  plugins: [],
}
