export default {
  rules: {
    'no-noisy-single-line-comments': {
      meta: {
        type: 'suggestion',
        docs: {
          description: 'Disallow noisy single-line comments. Use JSDoc or delete.',
        },
        messages: {
          noisyComment:
            'Explanatory comments must use /** */ format. Single-line // comments are for directives only (TODO, @ts-expect-error, etc.).',
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
