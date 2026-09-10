/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Government portal palette (navy header, saffron accent, formal neutrals)
        primary: '#1e3a5f',
        accent: '#c2410c',
        secondary: '#0f172a',
        success: '#15803d',
        warning: '#b45309',
        danger: '#b91c1c',
        background: '#f1f5f9',
        sidebar: '#0f2744',
        muted: '#475569',
        govstrip: '#0c4a6e',
      },
      fontFamily: {
        sans: ['"Source Sans Pro"', 'Arial', 'Helvetica', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
      },
      boxShadow: {
        'soft': '0 2px 12px -2px rgba(15, 39, 68, 0.08)',
        'premium': '0 8px 32px -8px rgba(15, 39, 68, 0.12)',
      }
    },
  },
  plugins: [],
}
