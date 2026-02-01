import { z } from "zod";

export const SyncedFileChangeSchema = z.object({
	path: z.string(),
	status: z.enum(["added", "modified", "deleted", "renamed"]),
	patch: z.string(),
	staged: z.boolean(),
});

export type SyncedFileChange = z.infer<typeof SyncedFileChangeSchema>;

export const ChangeSnapshotSchema = z.object({
	machineId: z.string(),
	machineName: z.string(),
	ownerId: z.string(),
	headSha: z.string(),
	branch: z.string(),
	cwd: z.string(),
	isLive: z.boolean(),
	updatedAt: z.number(),
	files: z.array(SyncedFileChangeSchema),
	totalAdditions: z.number(),
	totalDeletions: z.number(),
});

export type ChangeSnapshot = z.infer<typeof ChangeSnapshotSchema>;
