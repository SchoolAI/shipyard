import tsParser from '@typescript-eslint/parser';
import localRules from './eslint-local-rules.mjs';

export default [
  {
    files: [
      'packages/shared/**/*.ts',
      'packages/shared/**/*.tsx',
      'packages/schema/**/*.ts',
      'packages/schema/**/*.tsx',
      'apps/github-oauth-worker/**/*.ts',
      'apps/github-oauth-worker/**/*.tsx',
      'apps/signaling/**/*.ts',
      'apps/signaling/**/*.tsx',
      'apps/hook/**/*.ts',
      'apps/hook/**/*.tsx',
    ],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    plugins: {
      local: localRules,
    },
    rules: {
      'multiline-comment-style': ['warn', 'starred-block'],
      'spaced-comment': [
        'warn',
        'always',
        {
          exceptions: ['-', '+', '*'],
          markers: ['/'],
        },
      ],
      'local/no-noisy-single-line-comments': 'warn',
    },
  },
  {
    ignores: [
      'node_modules',
      'dist',
      'build',
      '**/*.config.js',
      '**/*.config.ts',
      '**/*.config.mjs',
      '**/tsdown.config.ts',
      '**/vite.config.ts',
    ],
  },
];
