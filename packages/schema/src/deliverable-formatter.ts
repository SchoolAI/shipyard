/**
 * Shared deliverable formatting for LLM-friendly output.
 * Used by both MCP server (read_plan) and hook (ExitPlanMode denial).
 */

import type { Deliverable } from "./plan.js";

/**
 * Format deliverables list for LLM consumption.
 * Matches the format used in read_plan tool.
 */
export function formatDeliverablesForLLM(deliverables: Deliverable[]): string {
	if (deliverables.length === 0) {
		return "";
	}

	let output = "## Deliverables\n\n";
	output += "Available deliverable IDs for artifact linking:\n\n";

	for (const deliverable of deliverables) {
		const checkbox = deliverable.linkedArtifactId ? "[x]" : "[ ]";
		const linkedInfo = deliverable.linkedArtifactId
			? ` (linked to artifact: ${deliverable.linkedArtifactId})`
			: "";
		output += `- ${checkbox} ${deliverable.text} {id="${deliverable.id}"}${linkedInfo}\n`;
	}

	return output;
}
