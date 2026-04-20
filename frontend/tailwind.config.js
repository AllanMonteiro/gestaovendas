/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#fef7f1',
          100: '#fdeee2',
          200: '#fbd0b8',
          300: '#f7ad8a',
          400: '#f08258',
          500: '#e55c2f',
          600: '#c4421d',
          700: '#993118',
          800: '#6c2415',
          900: '#43170e'
        }
      },
      fontFamily: {
        display: ['"Trebuchet MS"', '"Arial Rounded MT Bold"', '"Segoe UI"', 'sans-serif'],
        body: ['"Segoe UI"', 'Tahoma', 'Geneva', 'Verdana', 'sans-serif']
      }
    }
  },
  plugins: []
}
