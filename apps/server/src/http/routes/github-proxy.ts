/**
 * GitHub API proxy endpoints.
 *
 * These exist because browser can't call GitHub API directly (CORS).
 * Only 2 endpoints for PR data needed by the diff viewer.
 */

import type { Request, Response } from "express";

// TODO: Import GitHub helper
// import { getGitHubClient } from '../helpers/github.js'

/**
 * GET /api/plans/:id/pr-diff/:prNumber
 *
 * Returns raw diff text for a PR.
 * Response 200: string (raw diff)
 * Response 404: { error: 'PR not found' }
 * Response 500: { error: 'GitHub API error' }
 */
export async function prDiffRoute(req: Request, res: Response): Promise<void> {
	const { id: _planId, prNumber } = req.params;

	// TODO: Implement using GitHub service
	// const client = getGitHubClient()
	// const diff = await client.getPRDiff(repo, Number(prNumber))
	// res.type('text/plain').send(diff)

	res.status(501).json({
		error: "not_implemented",
		prNumber,
	});
}

/**
 * GET /api/plans/:id/pr-files/:prNumber
 *
 * Returns list of changed files in a PR.
 * Response 200: Array<{ path, additions, deletions, status }>
 * Response 404: { error: 'PR not found' }
 * Response 500: { error: 'GitHub API error' }
 */
export async function prFilesRoute(req: Request, res: Response): Promise<void> {
	const { id: _planId, prNumber } = req.params;

	// TODO: Implement using GitHub service
	// const client = getGitHubClient()
	// const files = await client.getPRFiles(repo, Number(prNumber))
	// res.json(files)

	res.status(501).json({
		error: "not_implemented",
		prNumber,
	});
}
