import { defineConfig } from 'tsup';

export default defineConfig({
	entry: ['src/index.ts'],
	format: ['cjs'], // CJS for pino compatibility (uses dynamic require internally)
	outExtension: () => ({ js: '.cjs' }), // .cjs extension ensures Node treats it as CommonJS even in ESM packages
	dts: false, // Project references break tsup type gen with workspace packages
	clean: true,
	sourcemap: false, // Exclude source maps from production builds (reduces size 43%)
	// Bundle ALL dependencies for npm publishing (npx needs standalone binary)
	// But keep Node.js built-ins external
	external: [
		'node:*', // Node.js built-in modules with node: prefix
		'fs', 'path', 'os', 'crypto', 'util', 'stream', 'events', 'http', 'https',
		'net', 'tls', 'zlib', 'child_process', 'buffer', 'url', 'querystring',
		'assert', 'constants', 'module', 'process', 'v8', 'vm', 'worker_threads',
	],
	noExternal: [/.*/], // Bundle everything else
	target: 'node22.14',
	shims: true, // Enable CJS/ESM shims for dynamic require in pino
});
