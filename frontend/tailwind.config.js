/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          green: '#1D9E75',
          blue: '#378ADD',
          orange: '#EF9F27',
          red: '#E24B4A',
          purple: '#7F77DD',
        },
        dark: {
          900: '#0D0F14',
          800: '#14181F',
          700: '#1C2130',
          600: '#242B3A',
          500: '#2E3749',
        }
      },
      borderRadius: {
        card: '12px',
      }
    }
  },
  plugins: [],
}
