import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        /** Primary Brand (Picton Blue) */
        primary: {
          DEFAULT: '#42cde5' /** picton-blue */,
          400: '#42cde5',
          500: '#42cde5',
          600: '#42cde5',
          700: '#348fa3',
          800: '#266f7f',
        },

        /** Neutrals (Blue-tinted: Blue Bayoux, Geyser, Wild Blue Yonder) */
        slate: {
          50: '#d6e1e0',
          100: '#d6e1e0',
          200: '#d6e1e0',
          300: '#748fb0',
          400: '#748fb0',
          500: '#4a5b74',
          600: '#4a5b74',
          700: '#4a5b74',
          800: '#13192e',
          900: '#13192e',
          950: '#13192e',
        },

        /** Accent (My Pink - AI indicators) */
        accent: {
          DEFAULT: '#cb9380',
          light: '#daa89d',
        },

        /** Semantic Status Colors */
        success: {
          DEFAULT: '#10b981' /** emerald-500 */,
          100: '#d1fae5' /** emerald-100 */,
          400: '#34d399' /** emerald-400 (for syntax highlighting) */,
          500: '#10b981' /** emerald-500 */,
          600: '#059669' /** emerald-600 */,
          light: '#d1fae5',
          dark: '#059669',
        },
        warning: {
          DEFAULT: '#cc5113' /** orange-roughy */,
          100: '#f5dcc8' /** orange-roughy-100 */,
          500: '#cc5113' /** orange-roughy */,
          600: '#a63f0d' /** orange-roughy-dark */,
          light: '#f5dcc8',
          dark: '#a63f0d',
        },
        danger: {
          DEFAULT: '#a51100' /** bright-red */,
          100: '#ffcccc' /** bright-red-100 */,
          400: '#d32f2f' /** bright-red-400 */,
          500: '#a51100' /** bright-red */,
          600: '#7a0c00' /** bright-red-dark */,
          light: '#ffcccc',
          dark: '#7a0c00',
        },
        info: {
          DEFAULT: '#748fb0' /** wild-blue-yonder */,
          100: '#dbeafe' /** blue-100 */,
          500: '#748fb0' /** wild-blue-yonder */,
          600: '#5a7090' /** wild-blue-yonder-dark */,
          light: '#dbeafe',
          dark: '#5a7090',
        },

        /** Semantic tokens using CSS variables (theme-aware) */
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        card: {
          DEFAULT: 'var(--surface)',
          foreground: 'var(--foreground)',
        },
        popover: {
          DEFAULT: 'var(--surface)',
          foreground: 'var(--foreground)',
        },
        muted: {
          DEFAULT: 'var(--muted)',
          foreground: 'var(--muted-foreground)',
        },
        destructive: {
          DEFAULT: '#cc5113' /** orange-roughy (changes requested) */,
          foreground: 'var(--snow)',
        },
        border: 'var(--muted)',
        input: 'var(--muted)',
        ring: 'var(--accent)',
      },
    },
  },
};

export default config;
