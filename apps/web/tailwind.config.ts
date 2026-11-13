import type { Config } from 'tailwindcss';

/**
 * Design tokens (CLAUDE.md §9.6), from the MSScore homepage design (Homepage-html/).
 * Navy + orange; orange buttons carry navy text (`primary.ink`) because white on
 * #F97316 fails contrast. Warnings and failures use a red ramp; green is pass only.
 * Chart keys are semantic so a palette change never touches components.
 */
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-body)', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'var(--font-body)', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      colors: {
        canvas: '#F6F4EF',
        surface: '#FFFFFF',
        sunken: '#EFEAE0',
        border: { DEFAULT: '#E7E2D8', strong: '#D6CFC2' },
        ink: { DEFAULT: '#0F1B2D', 2: '#4B5563', 3: '#64748B' },
        night: { DEFAULT: '#0F1B2D', 2: '#16263D', 3: '#22344F', line: '#2B3D57', deep: '#0A1220' },
        // Light text on navy surfaces.
        mist: { DEFAULT: '#FAF7F2', 2: '#E2E8F0', 3: '#CBD5E1' },
        primary: {
          DEFAULT: '#F97316',
          hover: '#EA580C',
          // Text on primary fills (navy on orange ≈ 6.4:1).
          ink: '#0F1B2D',
          soft: '#FFF1E6',
          chip: '#FFEDD5',
          // Orange text on light surfaces (#C2410C ≈ 5.2:1 on white).
          text: '#C2410C',
          heading: '#9A3412',
          tint: '#FDBA74',
        },
        // Orange accents on navy surfaces.
        brand: { DEFAULT: '#F97316', deep: '#EA580C' },
        // Tick marks on navy surfaces (design: #5EEAD4).
        tick: { DEFAULT: '#5EEAD4', light: '#0F766E' },
        // Landing page accents from the design: "fixed for you" boxes and sample chart.
        teal: { DEFAULT: '#0F766E', soft: '#99D5CF', bg: '#F1FAF8', text: '#0B5D55' },
        // "Always waits for your approval" chips and "Notice" alert label.
        amber: { bg: '#FEF3C7', text: '#92400E' },
        pass: { bg: '#DCFCE7', text: '#15803D' },
        warn: { bg: '#FEF2F2', text: '#C81E1E' },
        high: { bg: '#FEE2E2', text: '#B91C1C' },
        fail: { bg: '#FECACA', text: '#7F1D1D' },
        info: { bg: '#EFEAE0', text: '#4B5563' },
        chart: {
          pass: '#15803D',
          warn: '#F87171',
          high: '#DC2626',
          fail: '#991B1B',
          primary: '#F97316',
          track: '#E7E2D8',
          neutral: '#94A3B8',
        },
      },
      borderRadius: {
        card: '16px',
        panel: '18px',
        tile: '12px',
        button: '12px',
        control: '10px',
        pill: '6px',
        bar: '3px',
      },
      maxWidth: {
        page: '1120px',
      },
      boxShadow: {
        card: '0 1px 2px rgba(15, 23, 42, 0.04), 0 1px 1px rgba(15, 23, 42, 0.02)',
        lift: '0 12px 40px rgba(15, 23, 42, 0.10)',
      },
      letterSpacing: {
        display: '-0.03em',
      },
    },
  },
  plugins: [],
};

export default config;
