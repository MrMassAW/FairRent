/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          '"Plus Jakarta Sans"',
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica',
          'Arial',
          'sans-serif',
        ],
      },
      colors: {
        brand: {
          50: '#faf5ff',
          100: '#f3e8ff',
          200: '#e9d5ff',
          300: '#d8b4fe',
          400: '#c084fc',
          500: '#a855f7',
          600: '#9333ea',
          700: '#7c3aed',
          800: '#6b21a8',
          900: '#581c87',
        },
      },
      boxShadow: {
        app: '0 1px 2px 0 rgb(15 23 42 / 0.05), 0 8px 24px -6px rgb(15 23 42 / 0.08)',
        'app-lg': '0 4px 6px -1px rgb(15 23 42 / 0.06), 0 16px 40px -12px rgb(15 23 42 / 0.12)',
        'app-nav': '0 -2px 20px -2px rgb(15 23 42 / 0.08)',
      },
    },
  },
  plugins: [],
}
