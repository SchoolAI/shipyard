import { defineConfig } from "tsdown";

export default defineConfig({
	entry: ["src/index.ts", "src/client/index.ts"],
	format: ["esm"],
	dts: true,
	clean: false /** Don't clean in watch mode - tsdown rebuilds changed files */,
});
