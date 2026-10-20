/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['Heebo', 'system-ui', 'Segoe UI', 'Arial', 'sans-serif'] },
      colors: {
        brand: {
          50: '#f1f8f1',
          100: '#dcefdc',
          200: '#bbdfbc',
          300: '#8ec88f',
          400: '#5aab5d',
          500: '#3a9040',
          600: '#2f7d32',
          700: '#27652a',
          800: '#235025',
          900: '#1e4221',
        },
        cream: '#f4f7f2',
      },
      keyframes: {
        fade: { from: { opacity: 0 }, to: { opacity: 1 } },
        sheet: {
          from: { opacity: 0, transform: 'translateY(40px)' },
          to: { opacity: 1, transform: 'translateY(0)' },
        },
        rise: {
          from: { opacity: 0, transform: 'translateY(8px)' },
          to: { opacity: 1, transform: 'translateY(0)' },
        },
      },
      animation: {
        fade: 'fade .2s ease-out both',
        sheet: 'sheet .28s cubic-bezier(.2,.8,.2,1) both',
        rise: 'rise .35s ease-out both',
      },
    },
  },
  plugins: [],
};
