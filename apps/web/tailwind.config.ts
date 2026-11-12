import type { Config } from 'tailwindcss';

/**
 * Design tokens (CLAUDE.md §9.6). Orange is the main colour; warnings and failures
 * use a red ramp (medium → high → critical); green is reserved for pass/good only.
 * Chart keys are semantic so a palette change never touches components.
 */
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        display: ['var(--font-inter-tight)', 'var(--font-inter)', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      colors: {
        canvas: '#F7F6F4',
        surface: '#FFFFFF',
        sunken: '#F2F0ED',
        border: { DEFAULT: '#E8E4DF', strong: '#D4CDC6' },
        ink: { DEFAULT: '#18120E', 2: '#4D4540', 3: '#857A72' },
        night: { DEFAULT: '#110D0B', 2: '#1B1512', 3: '#2A211C', line: '#352A23' },
        primary: {
          // #CF450A keeps 4.6:1 contrast with white text on buttons.
          DEFAULT: '#CF450A',
          hover: '#B23B08',
          soft: '#FFF1E8',
          text: '#B23B08',
          heading: '#7C2D12',
          tint: '#FDBA8C',
        },
        // Bright orange for accents on dark surfaces (dark text on top).
        brand: { DEFAULT: '#FF7A1A', deep: '#E8590C' },
        pass: { bg: '#DCFCE7', text: '#15803D' },
        warn: { bg: '#FEF2F2', text: '#C81E1E' },
        high: { bg: '#FEE2E2', text: '#B91C1C' },
        fail: { bg: '#FECACA', text: '#7F1D1D' },
        info: { bg: '#EFECE8', text: '#4D4540' },
        chart: {
          pass: '#15803D',
          warn: '#F87171',
          high: '#DC2626',
          fail: '#991B1B',
          primary: '#E8590C',
          track: '#E8E4DF',
          neutral: '#ADA49C',
        },
      },
      borderRadius: {
        card: '16px',
        tile: '12px',
        control: '10px',
        pill: '6px',
        bar: '3px',
      },
      maxWidth: {
        page: '1120px',
      },
      boxShadow: {
        card: '0 1px 2px rgba(24, 18, 14, 0.04), 0 1px 1px rgba(24, 18, 14, 0.02)',
        lift: '0 24px 60px -24px rgba(17, 13, 11, 0.5)',
      },
      letterSpacing: {
        display: '-0.035em',
      },
    },
  },
  plugins: [],
};

export default config;
