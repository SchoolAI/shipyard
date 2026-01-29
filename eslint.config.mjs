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
            'DELETE this comment unless it explains WHY (not WHAT).\n\n' +
            'Per docs/engineering-standards.md:\n' +
            '• If comment explains WHAT the code does → DELETE it, improve naming instead\n' +
            '• If comment explains WHY (constraint/workaround/perf decision) → keep it\n' +
            '• Single-line // and /* */ are ONLY for directives: @ts-expect-error, TODO, biome-ignore\n' +
            '• Using /* */ instead of // does NOT bypass this rule\n' +
            '• JSDoc (/** */) is allowed for documentation\n\n' +
            'Examples of comments to DELETE:\n' +
            '  // Loop through items     ← obvious from code\n' +
            '  /* Return the result */   ← /* */ doesn\'t bypass the rule\n' +
            '  // Handle errors          ← obvious from catch block\n\n' +
            'Examples of comments to KEEP:\n' +
            '  /** Max 50 to prevent Firestore quota issues */   ← JSDoc OK\n' +
            '  // TODO: refactor this                            ← directive OK\n\n' +
            'ACTION: DELETE this comment, or convert to JSDoc (/** */) if it explains WHY.',
        },
        schema: [],
      },
      create(context) {
        const sourceCode = context.sourceCode || context.getSourceCode();
        const filename = context.filename || context.getFilename();
        const isTsx = filename.endsWith('.tsx');

        return {
          Program() {
            const comments = sourceCode.getAllComments();

            for (const comment of comments) {
              const text = comment.value.trim();

              /**
               * Skip multi-line block comments (legitimate JSDoc, license headers, etc.)
               * Only check: Line comments (//) and single-line non-JSDoc Block comments
               */
              const isMultiLineBlock =
                comment.type === 'Block' && comment.loc.start.line !== comment.loc.end.line;
              if (isMultiLineBlock) continue;

              /**
               * Allow JSDoc comments (start with double asterisk).
               * Block comments have value without the leading slash-star, so JSDoc value starts with *.
               * This allows JSDoc but blocks regular block comments.
               */
              const isJSDoc = comment.type === 'Block' && comment.value.startsWith('*');
              if (isJSDoc) continue;

              /**
               * Allow block comments in .tsx files since JSX requires {/* syntax.
               * You can't use // in JSX, so these aren't bypass attempts.
               */
              if (isTsx && comment.type === 'Block') continue;

              const allowedPatterns = [
                /^@ts-/,
                /^eslint-/,
                /^TODO/,
                /^FIXME/,
                /^NOTE/,
                /^HACK/,
                /^XXX/,
                /^biome-ignore/,
                /^\//, // Triple-slash directives (/// <reference ...)
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
    ignores: ['**/*.test.ts', '**/*.test.tsx', '**/__tests__/**'],
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
