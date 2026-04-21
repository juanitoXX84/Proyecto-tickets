/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}', './src/**/*.module.css'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        display: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
      },
      colors: {
        // Paleta alineada al logo Ticket Rivals (morado #6c0084 · marino #1c1c3c)
        brand: {
          50: '#fdf4fc',
          100: '#fae8f7',
          200: '#f5d0ef',
          300: '#eda9e0',
          400: '#d966c4',
          500: '#b800a8',
          600: '#6c0084',
          700: '#5a006d',
          800: '#450052',
          900: '#33003d',
          950: '#1c1c3c',
        },
        tr: {
          navy: '#1c1c3c',
          purple: '#6c0084',
        },
      },
      boxShadow: {
        card: '0 1px 3px 0 rgb(0 0 0 / 0.06), 0 1px 2px -1px rgb(0 0 0 / 0.06)',
        'card-hover': '0 10px 40px -10px rgb(88 28 135 / 0.35)',
      },
    },
  },
  plugins: [],
};
