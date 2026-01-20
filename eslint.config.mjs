import tsParser from '@typescript-eslint/parser';

/**
 * Custom ESLint rules for this project.
 * Defined inline as a plugin - ESLint requires this structure for custom rules.
 */
const localRules = {
  rules: {
    'no-noisy-single-line-comments': {
      meta: {
        type: 'suggestion',
        docs: {
          description: 'Disallow noisy single-line comments. Use JSDoc or delete.',
        },
        messages: {
          noisyComment:
            'STOP: Do NOT just convert this to /** */ format. Ask yourself: Is this comment actually useful?\n\n' +
            'Per docs/engineering-standards.md:\n' +
            '• Comments explain WHY, not WHAT\n' +
            '• If the comment explains what code does → delete it, fix the naming instead\n' +
            '• Only keep comments for: non-obvious constraints, workarounds, performance decisions\n\n' +
            'Single-line // comments are for directives only (TODO, @ts-expect-error, etc.).\n' +
            'If this comment is truly necessary, use /** */ format.',
        },
        schema: [],
      },
      create(context) {
        const sourceCode = context.sourceCode || context.getSourceCode();

        return {
          Program() {
            const comments = sourceCode.getAllComments();

            for (const comment of comments) {
              if (comment.type !== 'Line') continue;

              const text = comment.value.trim();

              const allowedPatterns = [
                /^@ts-/,
                /^eslint-/,
                /^TODO/,
                /^FIXME/,
                /^NOTE/,
                /^HACK/,
                /^XXX/,
                /^biome-ignore/,
              ];

              const isDirective = allowedPatterns.some((pattern) => pattern.test(text));
              if (isDirective) continue;

              context.report({
                loc: comment.loc,
                messageId: 'noisyComment',
              });
            }
          },
        };
      },
    },
  },
};

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
