/**
 * Tests for request_user_input → Browser Modal (passthrough)
 */

import { describe, expect, it } from "vitest";
import { transformToAskUserQuestion } from "./ask-user-question.js";

describe("transformToAskUserQuestion", () => {
	describe("all types passthrough to browser modal", () => {
		it("should passthrough choice request with 2 options", () => {
			const result = transformToAskUserQuestion({
				message: "Which database should we use?",
				type: "choice",
				options: ["PostgreSQL", "SQLite"],
			});

			expect(result.type).toBe("passthrough");
		});

		it("should passthrough choice request with 4 options", () => {
			const result = transformToAskUserQuestion({
				message: "What styling approach would you prefer?",
				type: "choice",
				options: [
					"Tailwind CSS",
					"Bootstrap",
					"Vanilla CSS",
					"Styled Components",
				],
			});

			expect(result.type).toBe("passthrough");
		});

		it("should passthrough choice with any number of options", () => {
			const result = transformToAskUserQuestion({
				message: "Which styling framework should we use?",
				type: "choice",
				options: ["Tailwind", "Bootstrap"],
			});

			expect(result.type).toBe("passthrough");
		});

		it("should passthrough choice with many options", () => {
			const result = transformToAskUserQuestion({
				message: "Which authentication provider should we use?",
				type: "choice",
				options: ["Auth0", "Clerk"],
			});

			expect(result.type).toBe("passthrough");
		});

		it("should passthrough text type", () => {
			const result = transformToAskUserQuestion({
				message: "Enter your API key",
				type: "text",
			});

			expect(result.type).toBe("passthrough");
		});

		it("should passthrough multiline type", () => {
			const result = transformToAskUserQuestion({
				message: "Describe the issue",
				type: "multiline",
			});

			expect(result.type).toBe("passthrough");
		});

		it("should passthrough confirm type", () => {
			const result = transformToAskUserQuestion({
				message: "Are you sure you want to delete?",
				type: "confirm",
			});

			expect(result.type).toBe("passthrough");
		});

		it("should passthrough choice with < 2 options", () => {
			const result = transformToAskUserQuestion({
				message: "Choose one",
				type: "choice",
				options: ["Only option"],
			});

			expect(result.type).toBe("passthrough");
		});

		it("should passthrough choice with > 4 options", () => {
			const result = transformToAskUserQuestion({
				message: "Choose one",
				type: "choice",
				options: ["Option 1", "Option 2", "Option 3", "Option 4", "Option 5"],
			});

			expect(result.type).toBe("passthrough");
		});

		it("should passthrough choice without options array", () => {
			const result = transformToAskUserQuestion({
				message: "Choose one",
				type: "choice",
			});

			expect(result.type).toBe("passthrough");
		});
	});
});
