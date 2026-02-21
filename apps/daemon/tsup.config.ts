import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: 'esm',
  dts: { tsconfig: './tsconfig.json' },
  sourcemap: true,
  platform: 'node',
  noExternal: [
    '@shipyard/loro-schema',
    '@shipyard/session',
    '@loro-extended/change',
    '@loro-extended/repo',
    '@loro-extended/adapter-webrtc',
    /^@tiptap\//,
    /^prosemirror-/,
    'loro-prosemirror',
    'markdown-it',
    'zod',
    'nanoid',
  ],
  external: ['node-pty', 'node-datachannel', 'loro-crdt', 'pino', 'pino-roll', '@anthropic-ai/claude-agent-sdk'],
  banner: {
    js: '#!/usr/bin/env node',
  },
});
