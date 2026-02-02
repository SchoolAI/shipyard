import { defineConfig } from "tsup";

export default defineConfig({
	entry: ["src/index.ts"],
	format: ["esm"],
	dts: false, // Disabled - DTS generation has tsconfig issues
	sourcemap: true,
	clean: true,
	target: "node22",
	external: ["pino-pretty"],
});
