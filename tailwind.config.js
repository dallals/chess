/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#0d0a08',
          900: '#14100b',
          800: '#1e1712',
          700: '#2a2018',
        },
        cream: {
          50: '#faf6ec',
          100: '#f4ecdd',
          200: '#e9dcc4',
          300: '#d8c8a8',
          400: '#b3a184',
          500: '#8d7c63',
        },
        brass: {
          100: '#f6e9c8',
          200: '#efd9a4',
          300: '#e6c26e',
          400: '#d4a542',
          500: '#b8862f',
          600: '#926823',
        },
        walnut: {
          300: '#a58266',
          400: '#8a684f',
          500: '#6b4a35',
          600: '#54382a',
          700: '#412a1e',
          800: '#2c1d14',
          850: '#241811',
          900: '#1d130c',
          950: '#120b07',
        },
        blood: {
          300: '#e08a7a',
          400: '#d05a42',
          500: '#c0442e',
          600: '#9c3524',
          700: '#7c2a1c',
        },
        board: {
          light: '#e9cfa4',
          dark: '#9a6748',
          move: '#c99a4e',
        },
      },
      fontFamily: {
        display: ['Cinzel', 'Georgia', 'serif'],
        body: ['Spectral', 'Georgia', 'serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      boxShadow: {
        panel: '0 24px 48px -24px rgba(0,0,0,0.85), inset 0 1px 0 rgba(244,236,221,0.05)',
        board: '0 40px 80px -32px rgba(0,0,0,0.9), 0 0 0 1px rgba(230,194,110,0.14)',
        lift: '0 10px 24px -12px rgba(0,0,0,0.8)',
        glow: '0 0 22px -6px rgba(212,165,66,0.5)',
      },
    },
  },
  plugins: [],
}
