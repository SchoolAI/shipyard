import { Mark, mergeAttributes } from "@tiptap/core";

/**
 * Custom comment mark for P1 validation.
 *
 * This mark represents a comment anchor in the document.
 * The commentId attribute links to a comment stored elsewhere (e.g., in Loro).
 */
export const CommentMark = Mark.create({
  name: "comment",

  addOptions() {
    return {
      HTMLAttributes: {
        class: "comment-mark",
      },
    };
  },

  addAttributes() {
    return {
      commentId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-comment-id"),
        renderHTML: (attributes) => {
          if (!attributes.commentId) return {};
          return { "data-comment-id": attributes.commentId };
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-comment-id]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes),
      0,
    ];
  },

  addCommands() {
    return {
      setComment:
        (commentId: string) =>
        ({ commands }) => {
          return commands.setMark(this.name, { commentId });
        },
      unsetComment:
        () =>
        ({ commands }) => {
          return commands.unsetMark(this.name);
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      // Mod+Shift+C to add a comment (generates a random ID for demo)
      "Mod-Shift-c": () => {
        const commentId = `comment-${Date.now()}`;
        console.log("[CommentMark] Creating comment with ID:", commentId);
        return this.editor.commands.setComment(commentId);
      },
    };
  },
});

// Type augmentation for Tiptap commands
declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    comment: {
      setComment: (commentId: string) => ReturnType;
      unsetComment: () => ReturnType;
    };
  }
}
