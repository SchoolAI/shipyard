import tseslint from '@typescript-eslint/eslint-plugin';
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

/**
 * ESLint Configuration (Blacklist Approach)
 *
 * Rules apply to ALL TypeScript/TSX files by default.
 * Use ignores to exclude files that shouldn't be checked.
 *
 * This ensures new files are automatically covered.
 */
export default [
  // Global ignores (apply to all rules)
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'build/**',
      '**/*.config.js',
      '**/*.config.ts',
      '**/*.config.mjs',
      '**/tsdown.config.ts',
      '**/vite.config.ts',
      // Test files excluded from type assertion rules (they need `as any` for Y.Doc)
      '**/*.test.ts',
      '**/*.test.tsx',
      '**/__tests__/**',
    ],
  },

  // TypeScript rules (apply to ALL .ts/.tsx files)
  {
    files: ['**/*.ts', '**/*.tsx'],
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
      '@typescript-eslint': tseslint,
      local: localRules,
    },
    rules: {
      // Comment quality rules - STRICT MODE
      'multiline-comment-style': ['error', 'starred-block'],
      'spaced-comment': [
        'error',
        'always',
        {
          exceptions: ['-', '+', '*'],
          markers: ['/'],
        },
      ],
      'local/no-noisy-single-line-comments': 'error',

      // Type assertion rules - STRICT MODE
      // Note: Biome handles noExplicitAny and noNonNullAssertion
      // ESLint only needed for consistent-type-assertions (Biome doesn't have this)
      '@typescript-eslint/consistent-type-assertions': [
        'error',
        {
          assertionStyle: 'never',
        },
      ],
    },
  },
];
