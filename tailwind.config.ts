/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Sea and night — the game's own key colours.
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
        // The pirate's desk: paper, oak, brass, wax, rope.
        'op-paper': '#EFE0BE',
        'op-paper-lit': '#F7EDD3',
        'op-paper-dim': '#DCC59A',
        'op-paper-deep': '#C0A277',
        'op-ink': '#2A1D14',
        'op-ink-soft': '#6A5340',
        'op-oak': '#43291A',
        'op-oak-dark': '#251610',
        'op-oak-lit': '#6B4527',
        'op-brass': '#C8973F',
        'op-brass-light': '#F1D386',
        'op-brass-dark': '#7C5A21',
        'op-wax': '#8E2B22',
        'op-wax-light': '#C0463A',
        'op-rope': '#C9A566',
        'op-sea': '#255C74',
        'op-sea-deep': '#0A2438',
        'op-foam': '#DCEDF0',
      },
      fontFamily: {
        display: ['"Pirata One"', 'Georgia', 'serif'],
        body: ['"Rubik"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      keyframes: {
        float: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-6px)' } },
        'pulse-gold': {
          '0%,100%': { boxShadow: '0 0 0 0 rgba(244,197,66,0.45)' },
          '50%': { boxShadow: '0 0 0 14px rgba(244,197,66,0)' },
        },
        shimmer: { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
        // A hull rides its swell: roll and heave are the same period, a quarter
        // out of phase, which is what makes it read as buoyancy and not wobble.
        rock: {
          '0%,100%': { transform: 'rotate(-2.4deg) translateY(0px)' },
          '25%': { transform: 'rotate(0deg) translateY(3px)' },
          '50%': { transform: 'rotate(2.4deg) translateY(0px)' },
          '75%': { transform: 'rotate(0deg) translateY(-3px)' },
        },
        bob: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-4px)' } },
        drift: { from: { transform: 'translateX(0)' }, to: { transform: 'translateX(-50%)' } },
        'drift-back': { from: { transform: 'translateX(-50%)' }, to: { transform: 'translateX(0)' } },
        // Wings on a two-beat: fast down, slower recover.
        flap: {
          '0%,100%': { transform: 'scaleY(1)' },
          '35%': { transform: 'scaleY(0.35)' },
          '60%': { transform: 'scaleY(1.15)' },
        },
        'lantern-flicker': {
          '0%,100%': { opacity: '0.86' },
          '18%': { opacity: '1' },
          '32%': { opacity: '0.7' },
          '55%': { opacity: '0.96' },
          '77%': { opacity: '0.78' },
        },
        'clock-urgent': {
          '0%,100%': { transform: 'scale(1)', filter: 'brightness(1)' },
          '50%': { transform: 'scale(1.07)', filter: 'brightness(1.35)' },
        },
        flare: {
          '0%': { transform: 'scale(1)', filter: 'brightness(1)' },
          '30%': { transform: 'scale(1.55)', filter: 'brightness(2.4)' },
          '100%': { transform: 'scale(1)', filter: 'brightness(1)' },
        },
        'seal-thump': {
          '0%': { transform: 'scale(2.6) rotate(-18deg)', opacity: '0' },
          '55%': { transform: 'scale(0.92) rotate(-9deg)', opacity: '1' },
          '75%': { transform: 'scale(1.06) rotate(-11deg)' },
          '100%': { transform: 'scale(1) rotate(-10deg)', opacity: '1' },
        },
      },
      animation: {
        float: 'float 3s ease-in-out infinite',
        'pulse-gold': 'pulse-gold 1.6s ease-in-out infinite',
        shimmer: 'shimmer 2.4s linear infinite',
        rock: 'rock 6.5s ease-in-out infinite',
        bob: 'bob 4.5s ease-in-out infinite',
        flap: 'flap 0.62s ease-in-out infinite',
        'lantern-flicker': 'lantern-flicker 3.4s ease-in-out infinite',
        'clock-urgent': 'clock-urgent 1s ease-in-out infinite',
        flare: 'flare 520ms ease-out 1',
        'seal-thump': 'seal-thump 420ms cubic-bezier(0.2, 1.4, 0.4, 1) 1 both',
      },
    },
  },
  plugins: [],
}
