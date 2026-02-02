import { nanoid } from "nanoid";
import { describe, expect, it } from "vitest";
import {
	AnyInputRequestSchema,
	type ChoiceOption,
	createInputRequest,
	createMultiQuestionInputRequest,
	InputRequestSchema,
	MultiQuestionInputRequestSchema,
	normalizeChoiceOptions,
} from "./input-request.js";

describe("InputRequestSchema validation", () => {
	describe("message validation", () => {
		it("should reject empty message strings", () => {
			const result = InputRequestSchema.safeParse({
				id: "test-id",
				createdAt: Date.now(),
				message: "",
				type: "text",
				status: "pending",
			});

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.issues[0]?.message).toBe("Message cannot be empty");
			}
		});

		it("should accept non-empty messages", () => {
			const result = InputRequestSchema.safeParse({
				id: "test-id",
				createdAt: Date.now(),
				message: "Valid message",
				type: "text",
				status: "pending",
			});

			expect(result.success).toBe(true);
		});
	});

	describe("timeout validation", () => {
		it("should reject negative timeouts", () => {
			const result = InputRequestSchema.safeParse({
				id: "test-id",
				createdAt: Date.now(),
				message: "Test",
				type: "text",
				status: "pending",
				timeout: -1,
			});

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.issues[0]?.message).toBe(
					"Timeout must be at least 300 seconds (5 minutes)",
				);
			}
		});

		it("should reject timeouts less than 300 seconds (5 minutes)", () => {
			const result = InputRequestSchema.safeParse({
				id: "test-id",
				createdAt: Date.now(),
				message: "Test",
				type: "text",
				status: "pending",
				timeout: 60,
			});

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.issues[0]?.message).toBe(
					"Timeout must be at least 300 seconds (5 minutes)",
				);
			}
		});

		it("should reject timeouts exceeding max (14400 seconds / 4 hours)", () => {
			const result = InputRequestSchema.safeParse({
				id: "test-id",
				createdAt: Date.now(),
				message: "Test",
				type: "text",
				status: "pending",
				timeout: 15000,
			});

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.issues[0]?.message).toBe(
					"Timeout cannot exceed 14400 seconds (4 hours)",
				);
			}
		});

		it("should reject non-integer timeouts", () => {
			const result = InputRequestSchema.safeParse({
				id: "test-id",
				createdAt: Date.now(),
				message: "Test",
				type: "text",
				status: "pending",
				timeout: 30.5,
			});

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.issues[0]?.message).toContain("expected int");
			}
		});

		it("should accept valid timeout values", () => {
			const validTimeouts = [300, 600, 1800, 3600, 7200, 14400];

			for (const timeout of validTimeouts) {
				const result = InputRequestSchema.safeParse({
					id: "test-id",
					createdAt: Date.now(),
					message: "Test",
					type: "text",
					status: "pending",
					timeout,
				});

				expect(result.success).toBe(true);
			}
		});

		it("should accept undefined timeout (optional field)", () => {
			const result = InputRequestSchema.safeParse({
				id: "test-id",
				createdAt: Date.now(),
				message: "Test",
				type: "text",
				status: "pending",
			});

			expect(result.success).toBe(true);
		});
	});
});

describe("createInputRequest", () => {
	it("should throw error for empty message", () => {
		expect(() => {
			createInputRequest({ message: "", type: "text" });
		}).toThrow();
	});

	it("should throw error for negative timeout", () => {
		expect(() => {
			createInputRequest({ message: "Test", type: "text", timeout: -1 });
		}).toThrow();
	});

	it("should throw error for timeout exceeding max", () => {
		expect(() => {
			createInputRequest({ message: "Test", type: "text", timeout: 15000 });
		}).toThrow();
	});

	it("should create valid request with valid inputs", () => {
		const request = createInputRequest({
			message: "Test message",
			type: "text",
			timeout: 600,
		});

		expect(request.message).toBe("Test message");
		expect(request.type).toBe("text");
		expect(request.timeout).toBe(600);
		expect(request.status).toBe("pending");
		expect(request.id).toBeDefined();
		expect(request.createdAt).toBeDefined();
	});
});

describe("ChoiceOption backward compatibility", () => {
	it("should accept string options (old format)", () => {
		const result = InputRequestSchema.safeParse({
			id: nanoid(),
			createdAt: Date.now(),
			message: "Choose one",
			type: "choice",
			status: "pending",
			options: [
				"A",
				"B",
				"C",
			] /** Legacy string[] format for backwards compatibility */,
		});
		expect(result.success).toBe(true);
	});

	it("should accept object options (new format)", () => {
		const result = InputRequestSchema.safeParse({
			id: nanoid(),
			createdAt: Date.now(),
			message: "Choose one",
			type: "choice",
			status: "pending",
			options: [
				{ value: "a", label: "Option A", description: "First option" },
				{ value: "b", label: "Option B" },
			],
		});
		expect(result.success).toBe(true);
	});

	it("should accept mixed options (both formats)", () => {
		const result = InputRequestSchema.safeParse({
			id: nanoid(),
			createdAt: Date.now(),
			message: "Choose one",
			type: "choice",
			status: "pending",
			options: [
				"Simple",
				{ value: "rich", label: "Rich Option", description: "Has description" },
			],
		});
		expect(result.success).toBe(true);
	});

	it("should accept object options with all optional fields", () => {
		const result = InputRequestSchema.safeParse({
			id: nanoid(),
			createdAt: Date.now(),
			message: "Choose one",
			type: "choice",
			status: "pending",
			options: [
				{
					value: "full",
					label: "Full Option",
					description: "Complete option",
					icon: "star",
					disabled: true,
				},
			],
		});
		expect(result.success).toBe(true);
	});

	it("should reject object options without value field", () => {
		const result = InputRequestSchema.safeParse({
			id: nanoid(),
			createdAt: Date.now(),
			message: "Choose one",
			type: "choice",
			status: "pending",
			options: [{ label: "Missing value" }],
		});
		expect(result.success).toBe(false);
	});
});

describe("normalizeChoiceOptions", () => {
	it("should convert string options to objects", () => {
		const options: ChoiceOption[] = ["A", "B", "C"];
		const normalized = normalizeChoiceOptions(options);

		expect(normalized).toEqual([
			{ value: "A", label: "A" },
			{ value: "B", label: "B" },
			{ value: "C", label: "C" },
		]);
	});

	it("should preserve object options", () => {
		const options: ChoiceOption[] = [
			{ value: "a", label: "Option A", description: "First" },
			{ value: "b", label: "Option B" },
		];
		const normalized = normalizeChoiceOptions(options);

		expect(normalized).toEqual([
			{ value: "a", label: "Option A", description: "First" },
			{ value: "b", label: "Option B" },
		]);
	});

	it("should handle mixed options", () => {
		const options: ChoiceOption[] = [
			"Simple",
			{ value: "rich", label: "Rich", description: "Has description" },
		];
		const normalized = normalizeChoiceOptions(options);

		expect(normalized).toEqual([
			{ value: "Simple", label: "Simple" },
			{ value: "rich", label: "Rich", description: "Has description" },
		]);
	});

	it("should use value as label when label is missing", () => {
		const options: ChoiceOption[] = [{ value: "no-label" }];
		const normalized = normalizeChoiceOptions(options);

		expect(normalized).toEqual([{ value: "no-label", label: "no-label" }]);
	});

	it("should preserve disabled and icon fields", () => {
		const options: ChoiceOption[] = [
			{ value: "disabled-opt", disabled: true, icon: "warning" },
		];
		const normalized = normalizeChoiceOptions(options);

		expect(normalized[0]).toMatchObject({
			value: "disabled-opt",
			label: "disabled-opt",
			disabled: true,
			icon: "warning",
		});
	});

	it("should return empty array for empty input", () => {
		const normalized = normalizeChoiceOptions([]);
		expect(normalized).toEqual([]);
	});
});

describe("MultilineInputRequest validation", () => {
	it("should accept valid multiline request", () => {
		const result = InputRequestSchema.safeParse({
			id: nanoid(),
			createdAt: Date.now(),
			message: "Describe the issue",
			type: "multiline",
			status: "pending",
		});
		expect(result.success).toBe(true);
	});

	it("should accept multiline request with defaultValue", () => {
		const result = InputRequestSchema.safeParse({
			id: nanoid(),
			createdAt: Date.now(),
			message: "Enter description",
			type: "multiline",
			status: "pending",
			defaultValue: "Default text here",
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.defaultValue).toBe("Default text here");
		}
	});

	it("should reject multiline request with empty message", () => {
		const result = InputRequestSchema.safeParse({
			id: nanoid(),
			createdAt: Date.now(),
			message: "",
			type: "multiline",
			status: "pending",
		});
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues[0]?.message).toBe("Message cannot be empty");
		}
	});
});

describe("ConfirmInputRequest validation", () => {
	it("should accept valid confirm request", () => {
		const result = InputRequestSchema.safeParse({
			id: nanoid(),
			createdAt: Date.now(),
			message: "Delete file?",
			type: "confirm",
			status: "pending",
		});
		expect(result.success).toBe(true);
	});

	it("should accept confirm request with timeout", () => {
		const result = InputRequestSchema.safeParse({
			id: nanoid(),
			createdAt: Date.now(),
			message: "Proceed with operation?",
			type: "confirm",
			status: "pending",
			timeout: 300,
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.timeout).toBe(300);
		}
	});

	it("should reject confirm request with empty message", () => {
		const result = InputRequestSchema.safeParse({
			id: nanoid(),
			createdAt: Date.now(),
			message: "",
			type: "confirm",
			status: "pending",
		});
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues[0]?.message).toBe("Message cannot be empty");
		}
	});
});

describe("NumberInputRequest validation", () => {
	it("should accept valid number request with bounds", () => {
		const result = InputRequestSchema.safeParse({
			id: nanoid(),
			createdAt: Date.now(),
			message: "How many retries?",
			type: "number",
			status: "pending",
			min: 0,
			max: 10,
		});
		expect(result.success).toBe(true);
	});

	it("should accept number request without bounds", () => {
		const result = InputRequestSchema.safeParse({
			id: nanoid(),
			createdAt: Date.now(),
			message: "Enter a number",
			type: "number",
			status: "pending",
		});
		expect(result.success).toBe(true);
	});

	it("should reject number request with min > max", () => {
		const result = InputRequestSchema.safeParse({
			id: nanoid(),
			createdAt: Date.now(),
			message: "Invalid",
			type: "number",
			status: "pending",
			min: 10,
			max: 5,
		});
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues[0]?.message).toBe("min must be <= max");
		}
	});

	it("should accept number request with format", () => {
		const result = InputRequestSchema.safeParse({
			id: nanoid(),
			createdAt: Date.now(),
			message: "Enter timeout",
			type: "number",
			status: "pending",
			format: "integer",
		});
		expect(result.success).toBe(true);
	});
});

describe("EmailInputRequest validation", () => {
	it("should accept valid email request", () => {
		const result = InputRequestSchema.safeParse({
			id: nanoid(),
			createdAt: Date.now(),
			message: "Enter your email",
			type: "email",
			status: "pending",
		});
		expect(result.success).toBe(true);
	});

	it("should accept email request with domain restriction", () => {
		const result = InputRequestSchema.safeParse({
			id: nanoid(),
			createdAt: Date.now(),
			message: "Enter work email",
			type: "email",
			status: "pending",
			domain: "company.com",
		});
		expect(result.success).toBe(true);
	});
});

describe("DateInputRequest validation", () => {
	it("should accept valid date request", () => {
		const result = InputRequestSchema.safeParse({
			id: nanoid(),
			createdAt: Date.now(),
			message: "Select deadline",
			type: "date",
			status: "pending",
		});
		expect(result.success).toBe(true);
	});

	it("should accept date request with min/max range", () => {
		const result = InputRequestSchema.safeParse({
			id: nanoid(),
			createdAt: Date.now(),
			message: "Select date",
			type: "date",
			status: "pending",
			min: "2026-01-01",
			max: "2026-12-31",
		});
		expect(result.success).toBe(true);
	});

	it("should reject date request with invalid date format", () => {
		const result = InputRequestSchema.safeParse({
			id: nanoid(),
			createdAt: Date.now(),
			message: "Select date",
			type: "date",
			status: "pending",
			min: "01-01-2026" /** Invalid format - should be YYYY-MM-DD */,
		});
		expect(result.success).toBe(false);
	});

	it("should reject date request with min > max", () => {
		const result = InputRequestSchema.safeParse({
			id: nanoid(),
			createdAt: Date.now(),
			message: "Select date",
			type: "date",
			status: "pending",
			min: "2026-12-31",
			max: "2026-01-01",
		});
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues[0]?.message).toBe(
				"min date must be before or equal to max date",
			);
		}
	});
});

describe("Choice with displayAs=dropdown validation", () => {
	it("should accept valid dropdown request with string options", () => {
		const result = InputRequestSchema.safeParse({
			id: nanoid(),
			createdAt: Date.now(),
			message: "Select country",
			type: "choice",
			status: "pending",
			options: ["United States", "Canada", "Mexico"],
			displayAs: "dropdown",
		});
		expect(result.success).toBe(true);
	});

	it("should accept dropdown request with object options", () => {
		const result = InputRequestSchema.safeParse({
			id: nanoid(),
			createdAt: Date.now(),
			message: "Select timezone",
			type: "choice",
			status: "pending",
			options: [
				{ value: "pst", label: "Pacific Time", description: "UTC-8" },
				{ value: "est", label: "Eastern Time", description: "UTC-5" },
			],
			displayAs: "dropdown",
		});
		expect(result.success).toBe(true);
	});

	it("should reject choice request without options", () => {
		const result = InputRequestSchema.safeParse({
			id: nanoid(),
			createdAt: Date.now(),
			message: "Select something",
			type: "choice",
			status: "pending",
			options: [],
			displayAs: "dropdown",
		});
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues[0]?.message).toBe(
				"Choice requests must have at least one option",
			);
		}
	});
});

describe("RatingInputRequest validation", () => {
	it("should accept valid rating request with defaults", () => {
		const result = InputRequestSchema.safeParse({
			id: nanoid(),
			createdAt: Date.now(),
			message: "Rate this feature",
			type: "rating",
			status: "pending",
		});
		expect(result.success).toBe(true);
	});

	it("should accept rating request with custom scale", () => {
		const result = InputRequestSchema.safeParse({
			id: nanoid(),
			createdAt: Date.now(),
			message: "Rate 1-10",
			type: "rating",
			status: "pending",
			min: 1,
			max: 10,
			style: "numbers",
			labels: { low: "Poor", high: "Excellent" },
		});
		expect(result.success).toBe(true);
	});

	it("should reject rating request with min > max", () => {
		const result = InputRequestSchema.safeParse({
			id: nanoid(),
			createdAt: Date.now(),
			message: "Invalid rating",
			type: "rating",
			status: "pending",
			min: 10,
			max: 1,
		});
		expect(result.success).toBe(false);
	});

	it("should reject rating request with scale > 20 items", () => {
		const result = InputRequestSchema.safeParse({
			id: nanoid(),
			createdAt: Date.now(),
			message: "Too many options",
			type: "rating",
			status: "pending",
			min: 1,
			max: 100,
		});
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues[0]?.message).toBe(
				"Rating scale must have min <= max and at most 20 items",
			);
		}
	});
});

describe("createInputRequest with new types", () => {
	it("should create number input request", () => {
		const request = createInputRequest({
			message: "Enter port number",
			type: "number",
			min: 1,
			max: 65535,
			format: "integer",
		});
		expect(request.type).toBe("number");
		expect(request.message).toBe("Enter port number");
		if (request.type === "number") {
			expect(request.min).toBe(1);
			expect(request.max).toBe(65535);
			expect(request.format).toBe("integer");
		}
	});

	it("should create email input request", () => {
		const request = createInputRequest({
			message: "Enter email",
			type: "email",
			domain: "company.com",
		});
		expect(request.type).toBe("email");
		if (request.type === "email") {
			expect(request.domain).toBe("company.com");
		}
	});

	it("should create date input request", () => {
		const request = createInputRequest({
			message: "Select date",
			type: "date",
			min: "2026-01-01",
			max: "2026-12-31",
		});
		expect(request.type).toBe("date");
		if (request.type === "date") {
			expect(request.min).toBe("2026-01-01");
			expect(request.max).toBe("2026-12-31");
		}
	});

	it("should create choice input with displayAs=dropdown", () => {
		const request = createInputRequest({
			message: "Select country",
			type: "choice",
			options: ["USA", "Canada"],
			displayAs: "dropdown",
			placeholder: "Choose...",
		});
		expect(request.type).toBe("choice");
		if (request.type === "choice") {
			expect(request.options).toEqual(["USA", "Canada"]);
			expect(request.displayAs).toBe("dropdown");
			expect(request.placeholder).toBe("Choose...");
		}
	});

	it("should create rating input request", () => {
		const request = createInputRequest({
			message: "Rate this",
			type: "rating",
			min: 1,
			max: 5,
			style: "stars",
			labels: { low: "Bad", high: "Great" },
		});
		expect(request.type).toBe("rating");
		if (request.type === "rating") {
			expect(request.style).toBe("stars");
			expect(request.labels).toEqual({ low: "Bad", high: "Great" });
		}
	});
});

/**
 * ============================================================================
 * MULTI-QUESTION SUPPORT TESTS
 * ============================================================================
 */

describe("MultiQuestionInputRequest validation", () => {
	it("should accept valid multi-question request with single question", () => {
		const result = MultiQuestionInputRequestSchema.safeParse({
			id: nanoid(),
			createdAt: Date.now(),
			type: "multi",
			questions: [{ type: "text", message: "What is your name?" }],
			status: "pending",
		});
		expect(result.success).toBe(true);
	});

	it("should accept valid multi-question request with 10 questions", () => {
		const result = MultiQuestionInputRequestSchema.safeParse({
			id: nanoid(),
			createdAt: Date.now(),
			type: "multi",
			questions: [
				{ type: "text", message: "What is your name?" },
				{ type: "number", message: "How old are you?", min: 0, max: 150 },
				{
					type: "choice",
					message: "Favorite color?",
					options: ["Red", "Green", "Blue"],
				},
				{ type: "confirm", message: "Agree to terms?" },
				{ type: "email", message: "Email address?" },
				{ type: "date", message: "Birth date?" },
				{ type: "rating", message: "Rate us?", min: 1, max: 5 },
				{ type: "multiline", message: "Comments?" },
				{ type: "text", message: "City?" },
				{ type: "text", message: "Country?" },
			],
			status: "pending",
		});
		expect(result.success).toBe(true);
	});

	it("should reject multi-question request with 0 questions", () => {
		const result = MultiQuestionInputRequestSchema.safeParse({
			id: nanoid(),
			createdAt: Date.now(),
			type: "multi",
			questions: [],
			status: "pending",
		});
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues[0]?.message).toBe(
				"At least one question is required",
			);
		}
	});

	it("should reject multi-question request with more than 10 questions", () => {
		const result = MultiQuestionInputRequestSchema.safeParse({
			id: nanoid(),
			createdAt: Date.now(),
			type: "multi",
			questions: [
				{ type: "text", message: "Q1" },
				{ type: "text", message: "Q2" },
				{ type: "text", message: "Q3" },
				{ type: "text", message: "Q4" },
				{ type: "text", message: "Q5" },
				{ type: "text", message: "Q6" },
				{ type: "text", message: "Q7" },
				{ type: "text", message: "Q8" },
				{ type: "text", message: "Q9" },
				{ type: "text", message: "Q10" },
				{ type: "text", message: "Q11" },
			],
			status: "pending",
		});
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues[0]?.message).toBe(
				"Maximum 10 questions allowed (8 recommended for optimal UX)",
			);
		}
	});

	it("should accept multi-question request with timeout", () => {
		const result = MultiQuestionInputRequestSchema.safeParse({
			id: nanoid(),
			createdAt: Date.now(),
			type: "multi",
			questions: [{ type: "text", message: "Name?" }],
			status: "pending",
			timeout: 300,
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.timeout).toBe(300);
		}
	});

	it("should accept multi-question request with responses (answered state)", () => {
		const result = MultiQuestionInputRequestSchema.safeParse({
			id: nanoid(),
			createdAt: Date.now(),
			type: "multi",
			questions: [
				{ type: "text", message: "Name?" },
				{ type: "number", message: "Age?" },
			],
			status: "answered",
			responses: { "0": "Alice", "1": "30" },
			answeredAt: Date.now(),
			answeredBy: "testuser",
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.responses).toEqual({ "0": "Alice", "1": "30" });
		}
	});

	it("should validate individual question types within multi-question", () => {
		const result = MultiQuestionInputRequestSchema.safeParse({
			id: nanoid(),
			createdAt: Date.now(),
			type: "multi",
			questions: [{ type: "invalid", message: "Test" }],
			status: "pending",
		});
		expect(result.success).toBe(false);
	});

	it("should validate choice question requires options", () => {
		const result = MultiQuestionInputRequestSchema.safeParse({
			id: nanoid(),
			createdAt: Date.now(),
			type: "multi",
			questions: [{ type: "choice", message: "Pick one", options: [] }],
			status: "pending",
		});
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues[0]?.message).toBe(
				"Choice questions must have at least one option",
			);
		}
	});

	it("should validate number question min <= max", () => {
		const result = MultiQuestionInputRequestSchema.safeParse({
			id: nanoid(),
			createdAt: Date.now(),
			type: "multi",
			questions: [{ type: "number", message: "Value?", min: 10, max: 5 }],
			status: "pending",
		});
		expect(result.success).toBe(false);
	});
});

describe("createMultiQuestionInputRequest", () => {
	it("should create valid multi-question request", () => {
		const request = createMultiQuestionInputRequest({
			questions: [
				{ type: "text", message: "What is your name?" },
				{
					type: "choice",
					message: "Favorite color?",
					options: ["Red", "Blue", "Green"],
				},
			],
			timeout: 600,
		});

		expect(request.type).toBe("multi");
		expect(request.questions).toHaveLength(2);
		expect(request.status).toBe("pending");
		expect(request.timeout).toBe(600);
		expect(request.id).toBeDefined();
		expect(request.createdAt).toBeDefined();
	});

	it("should throw for empty questions array", () => {
		expect(() => {
			createMultiQuestionInputRequest({
				questions: [],
			});
		}).toThrow("At least one question is required");
	});

	it("should throw for too many questions", () => {
		expect(() => {
			createMultiQuestionInputRequest({
				questions: [
					{ type: "text", message: "Q1" },
					{ type: "text", message: "Q2" },
					{ type: "text", message: "Q3" },
					{ type: "text", message: "Q4" },
					{ type: "text", message: "Q5" },
					{ type: "text", message: "Q6" },
					{ type: "text", message: "Q7" },
					{ type: "text", message: "Q8" },
					{ type: "text", message: "Q9" },
					{ type: "text", message: "Q10" },
					{ type: "text", message: "Q11" },
				],
			});
		}).toThrow("Maximum 10 questions allowed (8 recommended for optimal UX)");
	});
});

describe("isBlocker flag validation", () => {
	it("should accept request with isBlocker: true", () => {
		const result = InputRequestSchema.safeParse({
			id: nanoid(),
			createdAt: Date.now(),
			message: "Critical question",
			type: "confirm",
			status: "pending",
			isBlocker: true,
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.isBlocker).toBe(true);
		}
	});

	it("should accept request with isBlocker: false", () => {
		const result = InputRequestSchema.safeParse({
			id: nanoid(),
			createdAt: Date.now(),
			message: "Non-blocking question",
			type: "text",
			status: "pending",
			isBlocker: false,
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.isBlocker).toBe(false);
		}
	});

	it("should accept request without isBlocker (optional)", () => {
		const result = InputRequestSchema.safeParse({
			id: nanoid(),
			createdAt: Date.now(),
			message: "Regular question",
			type: "text",
			status: "pending",
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.isBlocker).toBeUndefined();
		}
	});

	it("should create input request with isBlocker flag", () => {
		const request = createInputRequest({
			message: "Blocking question",
			type: "confirm",
			isBlocker: true,
		});
		expect(request.isBlocker).toBe(true);
	});

	it("should accept multi-question request with isBlocker", () => {
		const result = MultiQuestionInputRequestSchema.safeParse({
			id: nanoid(),
			createdAt: Date.now(),
			type: "multi",
			questions: [{ type: "text", message: "Name?" }],
			status: "pending",
			isBlocker: true,
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.isBlocker).toBe(true);
		}
	});

	it("should create multi-question request with isBlocker flag", () => {
		const request = createMultiQuestionInputRequest({
			questions: [{ type: "text", message: "What is your name?" }],
			isBlocker: true,
		});
		expect(request.isBlocker).toBe(true);
	});
});

describe("AnyInputRequestSchema", () => {
	it("should accept single-question input request", () => {
		const result = AnyInputRequestSchema.safeParse({
			id: nanoid(),
			createdAt: Date.now(),
			message: "What is your name?",
			type: "text",
			status: "pending",
		});
		expect(result.success).toBe(true);
	});

	it("should accept multi-question input request", () => {
		const result = AnyInputRequestSchema.safeParse({
			id: nanoid(),
			createdAt: Date.now(),
			type: "multi",
			questions: [{ type: "text", message: "Name?" }],
			status: "pending",
		});
		expect(result.success).toBe(true);
	});

	it("should reject invalid request", () => {
		const result = AnyInputRequestSchema.safeParse({
			id: nanoid(),
			createdAt: Date.now(),
			type: "invalid",
			status: "pending",
		});
		expect(result.success).toBe(false);
	});
});
