/**
 * TruncatedText - Displays text with ellipsis overflow and tooltip on hover
 * Shows full text in a tooltip when hovering over truncated content
 */

import { Tooltip } from "@heroui/react";

interface TruncatedTextProps {
	/** Text to display (potentially truncated) */
	text: string;
	/** Maximum characters before truncation (default: 50) */
	maxLength?: number;
	/** Additional CSS classes for the text element */
	className?: string;
	/** HTML element to render (default: 'span') */
	as?: "span" | "div" | "p" | "h1" | "h2" | "h3";
}

/**
 * Renders text with automatic truncation and tooltip.
 *
 * If text length exceeds maxLength, shows ellipsis and displays
 * full text in tooltip on hover.
 *
 * @example
 * <TruncatedText
 *   text="Very long plan title that should be truncated"
 *   maxLength={50}
 *   className="font-semibold"
 * />
 */
export function TruncatedText({
	text,
	maxLength = 50,
	className = "",
	as: Component = "span",
}: TruncatedTextProps) {
	const isTruncated = text.length > maxLength;

	if (!isTruncated) {
		return <Component className={className}>{text}</Component>;
	}

	return (
		<Tooltip delay={0}>
			<Tooltip.Trigger>
				<Component className={className}>{text}</Component>
			</Tooltip.Trigger>
			<Tooltip.Content className="max-w-md">{text}</Tooltip.Content>
		</Tooltip>
	);
}
