/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'op-navy': '#0A1628',
        'op-ocean': '#0D2137',
        'op-deep': '#071020',
        'op-gold': '#F4C542',
        'op-gold-dim': '#B8942E',
        'op-red': '#D63031',
        'op-cyan': '#00B4D8',
        'op-cream': '#FFF5E4',
        'op-parchment': '#E8D5B7',
        'op-wood': '#8B6914',
        'op-green': '#27AE60',
      },
      fontFamily: {
        display: ['"Pirata One"', 'Georgia', 'serif'],
        body: ['"Rubik"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      keyframes: {
        'float': { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-6px)' } },
        'pulse-gold': {
          '0%,100%': { boxShadow: '0 0 0 0 rgba(244,197,66,0.45)' },
          '50%': { boxShadow: '0 0 0 14px rgba(244,197,66,0)' },
        },
        'shimmer': { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
      },
      animation: {
        float: 'float 3s ease-in-out infinite',
        'pulse-gold': 'pulse-gold 1.6s ease-in-out infinite',
        shimmer: 'shimmer 2.4s linear infinite',
      },
    },
  },
  plugins: [],
}
