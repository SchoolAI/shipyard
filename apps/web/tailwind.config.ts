import type { Config } from 'tailwindcss';

const config: Config = {
	content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
	theme: {
		extend: {
			colors: {
				// Primary Brand (Teal)
				primary: {
					DEFAULT: '#0D9488', // teal-600
					400: '#2dd4bf',
					500: '#14B8A6',
					600: '#0D9488',
					700: '#0f766e',
					800: '#115e59',
				},

				// Neutrals (Slate - replaces gray)
				slate: {
					50: '#f8fafc',
					100: '#f1f5f9',
					200: '#e2e8f0',
					300: '#cbd5e1',
					400: '#94a3b8',
					500: '#64748b',
					600: '#475569',
					700: '#334155',
					800: '#1e293b',
					900: '#0F172A',
					950: '#020617',
				},

				// Accent (Violet - AI indicators)
				accent: {
					DEFAULT: '#8b5cf6',
					light: '#a78bfa',
				},

				// Semantic Status Colors
				success: {
					DEFAULT: '#10b981', // emerald-500
					100: '#d1fae5', // emerald-100
					400: '#34d399', // emerald-400 (for syntax highlighting)
					500: '#10b981', // emerald-500
					600: '#059669', // emerald-600
					light: '#d1fae5',
					dark: '#059669',
				},
				warning: {
					DEFAULT: '#f59e0b', // amber-500
					100: '#fef3c7', // amber-100
					500: '#f59e0b', // amber-500
					600: '#d97706', // amber-600
					light: '#fef3c7',
					dark: '#d97706',
				},
				danger: {
					DEFAULT: '#f43f5e', // rose-500
					100: '#ffe4e6', // rose-100
					400: '#fb7185', // rose-400 (for syntax highlighting)
					500: '#f43f5e', // rose-500
					600: '#e11d48', // rose-600
					light: '#ffe4e6',
					dark: '#e11d48',
				},
				info: {
					DEFAULT: '#3b82f6', // blue-500
					100: '#dbeafe', // blue-100
					500: '#3b82f6', // blue-500
					600: '#2563eb', // blue-600
					light: '#dbeafe',
					dark: '#2563eb',
				},

				// shadcn/ui semantic tokens
				background: 'hsl(0 0% 100%)',
				foreground: 'hsl(215 25% 10%)',
				card: {
					DEFAULT: 'hsl(0 0% 100%)',
					foreground: 'hsl(215 25% 10%)',
				},
				popover: {
					DEFAULT: 'hsl(0 0% 100%)',
					foreground: 'hsl(215 25% 10%)',
				},
				muted: {
					DEFAULT: 'hsl(214 32% 96%)', // slate-100
					foreground: 'hsl(215 16% 47%)', // slate-600
				},
				destructive: {
					DEFAULT: '#f97316', // orange-500 (changes requested)
					foreground: 'hsl(0 0% 100%)',
				},
				border: 'hsl(214 32% 91%)', // slate-200
				input: 'hsl(214 32% 91%)', // slate-200
				ring: '#0D9488', // primary
			},
		},
	},
};

export default config;
