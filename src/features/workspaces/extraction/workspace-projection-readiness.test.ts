import { describe, expect, it } from "vitest";

import { workspaceExtractionStallThresholdMs } from "#/features/workspaces/extraction/workspace-extraction-budgets";
import { resolveWorkspaceProjectionReadiness } from "#/features/workspaces/extraction/workspace-projection-readiness";
import type { ReadWorkspaceFileExtractionResult } from "#/features/workspaces/kernel/workspace-kernel-types";

const now = Date.parse("2026-07-29T12:00:00.000Z");

function createProjection(
	overrides: Partial<ReadWorkspaceFileExtractionResult>,
): ReadWorkspaceFileExtractionResult {
	return {
		itemId: "item-1",
		status: "ready",
		provider: "liteparse",
		providerMode: "fast",
		errorMessage: null,
		sourceHash: "hash-1",
		metadataJson: { pageCount: 4 },
		updatedAt: new Date(now).toISOString(),
		...overrides,
	};
}

describe("resolveWorkspaceProjectionReadiness", () => {
	it("treats a missing projection row as queued", () => {
		expect(resolveWorkspaceProjectionReadiness(null, now)).toEqual({
			state: "pending",
			phase: "queued",
			elapsedSeconds: 0,
			retryAfterSeconds: 15,
		});
	});

	it("reports how long a processing projection has been running", () => {
		const projection = createProjection({
			status: "processing",
			sourceHash: null,
			updatedAt: new Date(now - 40_000).toISOString(),
		});

		expect(resolveWorkspaceProjectionReadiness(projection, now)).toEqual({
			state: "pending",
			phase: "extracting",
			elapsedSeconds: 40,
			retryAfterSeconds: 40,
		});
	});

	it("keeps the retry hint within its bounds as the wait grows", () => {
		const brief = resolveWorkspaceProjectionReadiness(
			createProjection({ status: "processing", updatedAt: new Date(now - 2_000).toISOString() }),
			now,
		);
		const long = resolveWorkspaceProjectionReadiness(
			createProjection({ status: "processing", updatedAt: new Date(now - 600_000).toISOString() }),
			now,
		);

		expect(brief).toMatchObject({ retryAfterSeconds: 15 });
		expect(long).toMatchObject({ retryAfterSeconds: 120 });
	});

	it("stalls a processing projection that outlived the retrying extraction budget", () => {
		const elapsedMs = workspaceExtractionStallThresholdMs + 60_000;
		const projection = createProjection({
			status: "processing",
			updatedAt: new Date(now - elapsedMs).toISOString(),
		});

		expect(resolveWorkspaceProjectionReadiness(projection, now)).toEqual({
			state: "stalled",
			elapsedSeconds: elapsedMs / 1000,
		});
	});

	// Derived rather than hardcoded: the threshold is the sum of every step budget, so
	// a literal here would silently stop testing the boundary the moment a timeout
	// moves — and calling a healthy run stalled makes readers give up on a document
	// that is still parsing.
	it("keeps a slow but healthy extraction pending rather than stalling it", () => {
		const projection = createProjection({
			status: "processing",
			updatedAt: new Date(now - (workspaceExtractionStallThresholdMs - 60_000)).toISOString(),
		});

		expect(resolveWorkspaceProjectionReadiness(projection, now)).toMatchObject({
			state: "pending",
			phase: "extracting",
		});
	});

	it("surfaces the recorded reason for a failed projection", () => {
		const projection = createProjection({
			status: "failed",
			errorMessage: "LiteParse failed with status 500.",
			sourceHash: null,
		});

		expect(resolveWorkspaceProjectionReadiness(projection, now)).toEqual({
			state: "failed",
			message: "LiteParse failed with status 500.",
		});
	});

	it("marks a ready projection missing its source revision as unreadable", () => {
		expect(
			resolveWorkspaceProjectionReadiness(createProjection({ sourceHash: null }), now),
		).toEqual({ state: "unreadable" });
	});

	it("exposes the page count for a ready projection", () => {
		expect(resolveWorkspaceProjectionReadiness(createProjection({}), now)).toEqual({
			state: "ready",
			pageCount: 4,
			sourceHash: "hash-1",
			provisional: false,
		});
	});

	it("flags a fast-pass projection as provisional", () => {
		const projection = createProjection({ metadataJson: { pageCount: 4, provisional: true } });

		expect(resolveWorkspaceProjectionReadiness(projection, now)).toMatchObject({
			state: "ready",
			provisional: true,
		});
	});
});
