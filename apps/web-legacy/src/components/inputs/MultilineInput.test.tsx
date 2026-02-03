/**
 * Tests for MultilineInput component.
 *
 * Verifies:
 * - Renders message as label
 * - Calls setValue on input change
 * - Shows character count
 * - Respects disabled state during submission
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MultilineInput } from "./MultilineInput";
import type { MultilineInputRequest } from "./types";

function createMultilineRequest(
	overrides: Partial<MultilineInputRequest> = {},
): MultilineInputRequest {
	return {
		id: "test-id",
		type: "multiline",
		message: "Enter description",
		status: "pending",
		createdAt: Date.now(),
		...overrides,
	};
}

describe("MultilineInput", () => {
	it("should render with message as label", () => {
		const request = createMultilineRequest({ message: "Describe your issue" });
		render(
			<MultilineInput
				request={request}
				value=""
				setValue={vi.fn()}
				isSubmitting={false}
			/>,
		);

		expect(screen.getByText("Describe your issue")).toBeInTheDocument();
	});

	it("should render a textarea (textbox role)", () => {
		const request = createMultilineRequest();
		render(
			<MultilineInput
				request={request}
				value=""
				setValue={vi.fn()}
				isSubmitting={false}
			/>,
		);

		expect(screen.getByRole("textbox")).toBeInTheDocument();
	});

	it("should call setValue when user types", async () => {
		const user = userEvent.setup();
		const setValue = vi.fn();
		const request = createMultilineRequest();

		render(
			<MultilineInput
				request={request}
				value=""
				setValue={setValue}
				isSubmitting={false}
			/>,
		);

		const textarea = screen.getByRole("textbox");
		await user.type(textarea, "Hi");

		expect(setValue).toHaveBeenCalledTimes(2);
		expect(setValue).toHaveBeenNthCalledWith(1, "H");
		expect(setValue).toHaveBeenNthCalledWith(2, "i");
	});

	it("should display character count for current value", () => {
		const request = createMultilineRequest();
		render(
			<MultilineInput
				request={request}
				value="Hello World"
				setValue={vi.fn()}
				isSubmitting={false}
			/>,
		);

		expect(screen.getByText("11 characters")).toBeInTheDocument();
	});

	it("should show 0 characters for empty value", () => {
		const request = createMultilineRequest();
		render(
			<MultilineInput
				request={request}
				value=""
				setValue={vi.fn()}
				isSubmitting={false}
			/>,
		);

		expect(screen.getByText("0 characters")).toBeInTheDocument();
	});

	it("should display current value in the textarea", () => {
		const request = createMultilineRequest();
		render(
			<MultilineInput
				request={request}
				value="existing text"
				setValue={vi.fn()}
				isSubmitting={false}
			/>,
		);

		const textarea = screen.getByRole("textbox");
		expect(textarea).toHaveValue("existing text");
	});

	it("should show defaultValue as placeholder", () => {
		const request = createMultilineRequest({
			defaultValue: "Enter details...",
		});
		render(
			<MultilineInput
				request={request}
				value=""
				setValue={vi.fn()}
				isSubmitting={false}
			/>,
		);

		const textarea = screen.getByRole("textbox");
		expect(textarea).toHaveAttribute("placeholder", "Enter details...");
	});

	it("should be disabled when isSubmitting is true", () => {
		const request = createMultilineRequest();
		render(
			<MultilineInput
				request={request}
				value=""
				setValue={vi.fn()}
				isSubmitting={true}
			/>,
		);

		const textarea = screen.getByRole("textbox");
		expect(textarea).toBeDisabled();
	});

	it("should handle non-string value gracefully", () => {
		const request = createMultilineRequest();
		render(
			<MultilineInput
				request={request}
				// biome-ignore lint/suspicious/noExplicitAny: Testing edge case with invalid value type
				value={["array"] as any}
				setValue={vi.fn()}
				isSubmitting={false}
			/>,
		);

		const textarea = screen.getByRole("textbox");
		expect(textarea).toHaveValue("");
		expect(screen.getByText("0 characters")).toBeInTheDocument();
	});
});
