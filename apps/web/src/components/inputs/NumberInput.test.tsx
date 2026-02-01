/**
 * Tests for NumberInput component.
 *
 * Verifies:
 * - Renders message as label
 * - Min/max bounds validation
 * - Error messages for out-of-range values
 * - Unit label display
 * - Correct input attributes (type, inputMode, step)
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NumberInput } from "./NumberInput";
import type { NumberInputRequest } from "./types";

function createNumberRequest(
	overrides: Partial<NumberInputRequest> = {},
): NumberInputRequest {
	return {
		id: "test-id",
		type: "number",
		message: "Enter a number",
		status: "pending",
		createdAt: Date.now(),
		...overrides,
	};
}

describe("NumberInput", () => {
	it("should render with message as label", () => {
		const request = createNumberRequest({ message: "How many items?" });
		render(
			<NumberInput
				request={request}
				value=""
				setValue={vi.fn()}
				isSubmitting={false}
			/>,
		);

		expect(screen.getByText("How many items?")).toBeInTheDocument();
	});

	it("should render a number input", () => {
		const request = createNumberRequest();
		render(
			<NumberInput
				request={request}
				value=""
				setValue={vi.fn()}
				isSubmitting={false}
			/>,
		);

		const input = screen.getByRole("spinbutton");
		expect(input).toHaveAttribute("type", "number");
	});

	it("should use numeric inputMode for integer format", () => {
		const request = createNumberRequest({ format: "integer" });
		render(
			<NumberInput
				request={request}
				value=""
				setValue={vi.fn()}
				isSubmitting={false}
			/>,
		);

		const input = screen.getByRole("spinbutton");
		expect(input).toHaveAttribute("inputMode", "numeric");
	});

	it("should use decimal inputMode for decimal format", () => {
		const request = createNumberRequest({ format: "decimal" });
		render(
			<NumberInput
				request={request}
				value=""
				setValue={vi.fn()}
				isSubmitting={false}
			/>,
		);

		const input = screen.getByRole("spinbutton");
		expect(input).toHaveAttribute("inputMode", "decimal");
	});

	it("should call setValue when user types", async () => {
		const user = userEvent.setup();
		const setValue = vi.fn();
		const request = createNumberRequest();

		render(
			<NumberInput
				request={request}
				value=""
				setValue={setValue}
				isSubmitting={false}
			/>,
		);

		const input = screen.getByRole("spinbutton");
		await user.type(input, "42");

		expect(setValue).toHaveBeenCalledTimes(2);
		expect(setValue).toHaveBeenNthCalledWith(1, "4");
		expect(setValue).toHaveBeenNthCalledWith(2, "2");
	});

	it("should display current value in the input", () => {
		const request = createNumberRequest();
		render(
			<NumberInput
				request={request}
				value="100"
				setValue={vi.fn()}
				isSubmitting={false}
			/>,
		);

		const input = screen.getByRole("spinbutton");
		expect(input).toHaveValue(100);
	});

	it("should not show error for empty value", () => {
		const request = createNumberRequest({ min: 0, max: 100 });
		render(
			<NumberInput
				request={request}
				value=""
				setValue={vi.fn()}
				isSubmitting={false}
			/>,
		);

		expect(screen.queryByRole("alert")).not.toBeInTheDocument();
	});

	it("should show error when value is below minimum", () => {
		const request = createNumberRequest({ min: 10 });
		render(
			<NumberInput
				request={request}
				value="5"
				setValue={vi.fn()}
				isSubmitting={false}
			/>,
		);

		expect(screen.getByRole("alert")).toHaveTextContent("Must be at least 10");
	});

	it("should show error when value is above maximum", () => {
		const request = createNumberRequest({ max: 100 });
		render(
			<NumberInput
				request={request}
				value="150"
				setValue={vi.fn()}
				isSubmitting={false}
			/>,
		);

		expect(screen.getByRole("alert")).toHaveTextContent("Must be at most 100");
	});

	it("should show combined error for both bounds violated", () => {
		const request = createNumberRequest({ min: 10, max: 100 });
		render(
			<NumberInput
				request={request}
				value="5"
				setValue={vi.fn()}
				isSubmitting={false}
			/>,
		);

		expect(screen.getByRole("alert")).toHaveTextContent("Must be at least 10");
	});

	it("should show error for invalid number input", () => {
		const request = createNumberRequest();
		render(
			<NumberInput
				request={request}
				value="not-a-number"
				setValue={vi.fn()}
				isSubmitting={false}
			/>,
		);

		expect(screen.getByRole("alert")).toHaveTextContent(
			"Please enter a valid number",
		);
	});

	it("should not show error for valid number within bounds", () => {
		const request = createNumberRequest({ min: 0, max: 100 });
		render(
			<NumberInput
				request={request}
				value="50"
				setValue={vi.fn()}
				isSubmitting={false}
			/>,
		);

		expect(screen.queryByRole("alert")).not.toBeInTheDocument();
	});

	it("should set min and max attributes on input", () => {
		const request = createNumberRequest({ min: 1, max: 10 });
		render(
			<NumberInput
				request={request}
				value=""
				setValue={vi.fn()}
				isSubmitting={false}
			/>,
		);

		const input = screen.getByRole("spinbutton");
		expect(input).toHaveAttribute("min", "1");
		expect(input).toHaveAttribute("max", "10");
	});

	it("should set step=1 for integer format", () => {
		const request = createNumberRequest({ format: "integer" });
		render(
			<NumberInput
				request={request}
				value=""
				setValue={vi.fn()}
				isSubmitting={false}
			/>,
		);

		const input = screen.getByRole("spinbutton");
		expect(input).toHaveAttribute("step", "1");
	});

	it("should set step=0.01 for decimal format", () => {
		const request = createNumberRequest({ format: "decimal" });
		render(
			<NumberInput
				request={request}
				value=""
				setValue={vi.fn()}
				isSubmitting={false}
			/>,
		);

		const input = screen.getByRole("spinbutton");
		expect(input).toHaveAttribute("step", "0.01");
	});

	it("should set aria-invalid when value is invalid", () => {
		const request = createNumberRequest({ min: 10 });
		render(
			<NumberInput
				request={request}
				value="5"
				setValue={vi.fn()}
				isSubmitting={false}
			/>,
		);

		const input = screen.getByRole("spinbutton");
		expect(input).toHaveAttribute("aria-invalid", "true");
	});

	it("should be disabled when isSubmitting is true", () => {
		const request = createNumberRequest();
		render(
			<NumberInput
				request={request}
				value=""
				setValue={vi.fn()}
				isSubmitting={true}
			/>,
		);

		const input = screen.getByRole("spinbutton");
		expect(input).toBeDisabled();
	});
});
