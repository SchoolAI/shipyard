import tsParser from '@typescript-eslint/parser';

export default [
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
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
