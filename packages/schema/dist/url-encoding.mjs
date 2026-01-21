import lzstring from "lz-string";

//#region src/url-encoding.ts
/**
* Type guard for v1 plans.
*/
function isUrlEncodedPlanV1(plan) {
	return plan.v === 1;
}
/**
* Type guard for v2 plans with version history.
*/
function isUrlEncodedPlanV2(plan) {
	return plan.v === 2;
}
/**
* Encodes a plan to a URL-safe compressed string.
*
* Uses lz-string compression + URI encoding for maximum compatibility.
* Typical compression: 40-60% reduction.
*/
function encodePlan(plan) {
	const json = JSON.stringify(plan);
	return lzstring.compressToEncodedURIComponent(json);
}
/**
* Decodes a URL-encoded plan string.
* Supports both v1 and v2 plan formats.
*
* Returns null if decoding fails or data is corrupted.
*/
function decodePlan(encoded) {
	try {
		const json = lzstring.decompressFromEncodedURIComponent(encoded);
		if (!json) return null;
		return JSON.parse(json);
	} catch (_error) {
		return null;
	}
}
/**
* Creates a complete plan URL from a plan object.
*
* @param baseUrl - Base URL for the app (e.g., "https://org.github.io/shipyard")
* @param plan - Plan object to encode
* @returns Complete URL with encoded plan
*/
function createPlanUrl(baseUrl, plan) {
	const encoded = encodePlan(plan);
	const url = new URL(baseUrl);
	url.searchParams.set("d", encoded);
	return url.toString();
}
/**
* Select key versions for URL encoding.
* Returns IDs of significant versions: first, first approval, and latest.
* Maximum 3 versions to limit URL size.
*/
function selectKeyVersionIds(snapshots) {
	if (snapshots.length === 0) return [];
	if (snapshots.length <= 3) return snapshots.map((s) => s.id);
	const ids = [];
	const first = snapshots[0];
	if (first) ids.push(first.id);
	const firstApproval = snapshots.find((s) => s.status === "in_progress");
	if (firstApproval && !ids.includes(firstApproval.id)) ids.push(firstApproval.id);
	const last = snapshots[snapshots.length - 1];
	if (last && !ids.includes(last.id)) ids.push(last.id);
	return ids;
}
/**
* Creates a plan URL with version history included.
* Optimizes size by storing:
* - Current state (full content)
* - Version refs (lightweight metadata) for all versions
* - Key versions (full content) for 2-3 significant versions
*
* @param baseUrl - Base URL for the app
* @param plan - Base plan data (without version info)
* @param snapshots - All snapshots from Y.Doc
* @returns Complete URL with version history
*/
function createPlanUrlWithHistory(baseUrl, plan, snapshots) {
	const versionRefs = snapshots.map((s) => ({
		id: s.id,
		status: s.status,
		createdBy: s.createdBy,
		reason: s.reason,
		createdAt: s.createdAt,
		threads: s.threadSummary
	}));
	const keyVersionIds = selectKeyVersionIds(snapshots);
	const keyVersions = snapshots.filter((s) => keyVersionIds.includes(s.id)).map((s) => ({
		id: s.id,
		content: s.content
	}));
	return createPlanUrl(baseUrl, {
		v: 2,
		...plan,
		versionRefs: versionRefs.length > 0 ? versionRefs : void 0,
		keyVersions: keyVersions.length > 0 ? keyVersions : void 0
	});
}
/**
* Extracts and decodes plan from current URL.
*
* @returns Decoded plan or null if not found/invalid
*/
function getPlanFromUrl() {
	if (typeof globalThis !== "undefined" && "location" in globalThis) {
		const location = globalThis.location;
		const encoded = new URLSearchParams(location.search).get("d");
		if (!encoded) return null;
		return decodePlan(encoded);
	}
	return null;
}

//#endregion
export { createPlanUrl, createPlanUrlWithHistory, decodePlan, encodePlan, getPlanFromUrl, isUrlEncodedPlanV1, isUrlEncodedPlanV2 };
//# sourceMappingURL=url-encoding.mjs.map