import type { Config } from 'tailwindcss';

/**
 * Design tokens. Semantic status colours follow CLAUDE.md §9.1; brand surfaces,
 * primary and typography follow the Search Atlas-inspired direction (§9.6).
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
        canvas: '#F6F5FA',
        surface: '#FFFFFF',
        sunken: '#F1EFF6',
        border: { DEFAULT: '#E6E3EF', strong: '#CFCADD' },
        ink: { DEFAULT: '#120B1F', 2: '#4A4560', 3: '#7E7A9B' },
        night: { DEFAULT: '#0D0817', 2: '#170F29', 3: '#241A3B', line: '#2E2447' },
        primary: {
          DEFAULT: '#6D40BC',
          hover: '#5A30A6',
          soft: '#F1EBFC',
          text: '#5A30A6',
          heading: '#2E1660',
          tint: '#B89BEE',
        },
        brand: { DEFAULT: '#30BC94', deep: '#1F9E7A' },
        pass: { bg: '#DCFCE7', text: '#15803D' },
        fail: { bg: '#FEE2E2', text: '#B91C1C' },
        warn: { bg: '#FEF9C3', text: '#854D0E' },
        high: { bg: '#FFEDD5', text: '#C2410C' },
        info: { bg: '#EEECF3', text: '#4A4560' },
        chart: {
          green: '#15803D',
          yellow: '#CA8A04',
          orange: '#EA580C',
          red: '#DC2626',
          violet: '#6D40BC',
          track: '#E6E3EF',
          neutral: '#A39FBA',
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
        card: '0 1px 2px rgba(18, 11, 31, 0.04), 0 1px 1px rgba(18, 11, 31, 0.02)',
        lift: '0 24px 60px -24px rgba(13, 8, 23, 0.45)',
      },
      letterSpacing: {
        display: '-0.035em',
      },
    },
  },
  plugins: [],
};

export default config;
