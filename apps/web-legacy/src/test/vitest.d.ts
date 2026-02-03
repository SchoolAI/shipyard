/**
 * TypeScript declarations for Vitest + @testing-library/jest-dom.
 * Extends Vitest's Assertion interface with jest-dom matchers.
 */

/// <reference types="@testing-library/jest-dom" />

import type { TestingLibraryMatchers } from "@testing-library/jest-dom/matchers";

declare module "vitest" {
	interface Assertion<T = unknown> extends TestingLibraryMatchers<T, void> {}
	interface AsymmetricMatchersContaining
		extends TestingLibraryMatchers<unknown, void> {}
}
