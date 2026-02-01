/**
 * Type declarations for the daemon auto-start module.
 *
 * The daemon is built as a standalone CLI without .d.ts files (dts: false in tsup config).
 * This declaration file enables TypeScript to understand the daemon's exports when importing
 * from the compiled JavaScript file in daemon-launcher.ts.
 *
 * Wildcard module declaration is used because the import path is relative from
 * the importing file (../../daemon/dist/auto-start.js) and TypeScript needs a
 * pattern that matches regardless of resolution context.
 */
declare module "*/daemon/dist/auto-start.js" {
	export function isAutoStartConfigured(): Promise<boolean>;
	export function setupAutoStart(): Promise<boolean>;
}
