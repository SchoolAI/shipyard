import { describe, expect, it } from "vitest";
import { hashLineContent } from "./line-content-hash.js";

describe("hashLineContent", () => {
	it("should return a hex string", () => {
		const hash = hashLineContent("const x = 1;");
		expect(hash).toMatch(/^-?[0-9a-f]+$/);
	});

	it("should return the same hash for the same content", () => {
		const content = 'function hello() { return "world"; }';
		const hash1 = hashLineContent(content);
		const hash2 = hashLineContent(content);
		expect(hash1).toBe(hash2);
	});

	it("should return different hashes for different content", () => {
		const hash1 = hashLineContent("const a = 1;");
		const hash2 = hashLineContent("const a = 2;");
		expect(hash1).not.toBe(hash2);
	});

	it("should handle empty strings", () => {
		const hash = hashLineContent("");
		expect(hash).toBe("0");
	});

	it("should handle whitespace differences", () => {
		const hash1 = hashLineContent("const x = 1;");
		const hash2 = hashLineContent("const x  = 1;");
		expect(hash1).not.toBe(hash2);
	});

	it("should be consistent across multiple calls", () => {
		const hashes = new Set<string>();
		const content = 'import { foo } from "bar";';
		for (let i = 0; i < 100; i++) {
			hashes.add(hashLineContent(content));
		}
		expect(hashes.size).toBe(1);
	});
});
