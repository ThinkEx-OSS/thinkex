import { workspaceExtractionStallThresholdMs } from "#/features/workspaces/extraction/workspace-extraction-budgets";
import type { ReadWorkspaceFileExtractionResult } from "#/features/workspaces/kernel/workspace-kernel-types";

const minimumRetryAfterSeconds = 15;
const maximumRetryAfterSeconds = 120;

export type WorkspaceProjectionReadiness =
	| {
			state: "pending";
			phase: "queued" | "extracting";
			elapsedSeconds: number;
			retryAfterSeconds: number;
	  }
	| { state: "stalled"; elapsedSeconds: number }
	| { state: "failed"; message: string | null }
	| { state: "unreadable" }
	| {
			state: "ready";
			pageCount: number;
			sourceHash: string;
			provisional: boolean;
	  };

/**
 * Classifies a page-projection row into the states a content read cares about.
 *
 * Extraction publishes a fast projection before the higher-quality pass finishes,
 * so a `ready` projection may still be provisional, and a `processing` one may be
 * either genuinely in flight or abandoned by a dead workflow. Keeping the
 * classification pure means each of those cases is decided in one place rather
 * than as extra branches inside the read path.
 *
 * @param projection - Projection row for the `pages` format, or null when extraction has not recorded one yet.
 * @param now - Current time in epoch milliseconds, used to age `processing` rows.
 * @returns How the projection should be treated by a content read.
 */
export function resolveWorkspaceProjectionReadiness(
	projection: ReadWorkspaceFileExtractionResult | null,
	now: number,
): WorkspaceProjectionReadiness {
	if (!projection) {
		return {
			state: "pending",
			phase: "queued",
			elapsedSeconds: 0,
			retryAfterSeconds: minimumRetryAfterSeconds,
		};
	}

	if (projection.status === "processing") {
		const elapsedMs = Math.max(0, now - Date.parse(projection.updatedAt));
		if (elapsedMs > workspaceExtractionStallThresholdMs) {
			return { state: "stalled", elapsedSeconds: Math.round(elapsedMs / 1000) };
		}

		const elapsedSeconds = Math.round(elapsedMs / 1000);
		return {
			state: "pending",
			phase: "extracting",
			elapsedSeconds,
			// Back off as the wait grows so a slow image extraction is not re-read every 15s.
			retryAfterSeconds: Math.min(
				maximumRetryAfterSeconds,
				Math.max(minimumRetryAfterSeconds, elapsedSeconds),
			),
		};
	}

	if (projection.status === "failed") {
		return { state: "failed", message: projection.errorMessage };
	}

	const pageCount = projection.metadataJson.pageCount;
	if (!projection.sourceHash || !Number.isInteger(pageCount) || Number(pageCount) < 1) {
		return { state: "unreadable" };
	}

	return {
		state: "ready",
		pageCount: Number(pageCount),
		sourceHash: projection.sourceHash,
		provisional: projection.metadataJson.provisional === true,
	};
}
