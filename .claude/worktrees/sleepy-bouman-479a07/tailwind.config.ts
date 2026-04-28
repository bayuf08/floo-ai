import type { Config } from 'tailwindcss'

export default <Config>{
  content: ['./app/**/*.{vue,ts,js}'],
  theme: {
    extend: {
      colors: {
        // Raw palette ramps (theme-independent — for accents)
        purple: {
          50: '#F3F0FA',
          100: '#E5DFEF',
          200: '#C9BEDE',
          300: '#A99ACF',
          400: '#7B67BD',
          500: '#5B479D',
          600: '#4A3A80',
          700: '#3D2E6E',
          800: '#2D2152',
          900: '#1B1726',
        },
        amber: {
          50: '#FFF8EB',
          100: '#FFEFC5',
          200: '#FDE09A',
          300: '#FCC570',
          400: '#FBB040',
          500: '#E89A1F',
          600: '#C07D10',
          700: '#8E5B08',
          800: '#5C3B05',
          900: '#2E1D03',
        },

        // Semantic, theme-aware tokens (same names old code used; values are now CSS vars)
        floo: {
          bg: 'var(--bg)',
          'bg-2': 'var(--bg-2)',
          surface: 'var(--surface)',
          'surface-2': 'var(--surface-2)',
          'surface-hover': 'var(--surface-2)',  // legacy alias
          'surface-elev': 'var(--surface-elev)',
          border: 'var(--border)',
          'border-soft': 'var(--border-soft)',
          'border-light': 'var(--border-soft)',  // legacy alias
          'border-strong': 'var(--border-strong)',
          text: 'var(--fg)',
          'text-secondary': 'var(--fg-2)',
          'text-muted': 'var(--fg-3)',
          'text-inverse': 'var(--fg-inverse)',
          brand: 'var(--brand)',
          'brand-fg': 'var(--brand-fg)',
          'brand-tint': 'var(--brand-tint)',
          'brand-soft': 'var(--brand-soft)',
          cta: 'var(--cta)',
          'cta-fg': 'var(--cta-fg)',
          'cta-tint': 'var(--cta-tint)',
          platform: 'var(--platform)',
          'platform-tint': 'var(--platform-tint)',
        },
      },
      fontFamily: {
        display: ['"Funnel Display"', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        editorial: ['Besley', 'Georgia', 'serif'],
      },
      spacing: {
        sidebar: '260px',
        'sidebar-collapsed': '64px',
        'right-panel': '340px',
      },
      borderRadius: {
        'floo-xs': 'var(--r-xs)',
        'floo-sm': 'var(--r-sm)',
        'floo-md': 'var(--r-md)',
        'floo-lg': 'var(--r-lg)',
        'floo-xl': 'var(--r-xl)',
        'floo-2xl': 'var(--r-2xl)',
        'floo-pill': 'var(--r-pill)',
      },
      boxShadow: {
        'floo-xs': 'var(--shadow-xs)',
        'floo-sm': 'var(--shadow-sm)',
        'floo-md': 'var(--shadow-md)',
        'floo-lg': 'var(--shadow-lg)',
        'floo-xl': 'var(--shadow-xl)',
      },
      transitionTimingFunction: {
        'floo-out': 'cubic-bezier(0.16, 1, 0.3, 1)',
        'floo-spring': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
    },
  },
  plugins: [],
}
