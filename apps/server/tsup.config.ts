import { defineConfig } from 'tsup';

export default defineConfig({
	entry: ['src/index.ts'],
	format: ['esm'],
	dts: false, // Project references break tsup type gen with workspace packages
	clean: true,
	sourcemap: false, // Exclude source maps from production builds (reduces size 43%)
	// Bundle ALL dependencies for plugin distribution (needs to run without node_modules)
	noExternal: [/.*/],
	target: 'node22.14',
	shims: false,
});
