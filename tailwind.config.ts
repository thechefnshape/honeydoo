import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        honey: { DEFAULT: '#FFC629', deep: '#E8AE0C', soft: '#FFF4D1' },
        ink: '#0B0B0B',
        charcoal: '#333333',
        stone: { DEFAULT: '#EDEDED', soft: '#F6F6F5', line: '#E3E3E1' },
        muted: '#6B6B68',
        ok: '#1F7A4D',
        warn: '#9A6400',
        bad: '#B42318',
      },
      fontFamily: {
        sans: ['Satoshi', '"Figtree Variable"', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
      },
      borderRadius: { xl: '14px', '2xl': '18px' },
      maxWidth: { page: '1200px' },
    },
  },
  plugins: [],
} satisfies Config;
