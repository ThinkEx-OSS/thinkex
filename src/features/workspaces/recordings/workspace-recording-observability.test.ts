import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("#/integrations/observability/operational-events", () => ({
	recordOperationalOutcome: vi.fn(),
}));

import { recordOperationalOutcome } from "#/integrations/observability/operational-events";
import { recordWorkspaceRecordingTranscriptionOutcome } from "#/features/workspaces/recordings/workspace-recording-observability";

const mocked = vi.mocked(recordOperationalOutcome);

describe("recordWorkspaceRecordingTranscriptionOutcome", () => {
	beforeEach(() => {
		mocked.mockClear();
	});

	it("records a successful run with the item, attempt, workflow and latency context", () => {
		recordWorkspaceRecordingTranscriptionOutcome({
			attempt: 2,
			durationMs: 1234,
			instanceId: "wf_1",
			itemId: "item_1",
			schedule: () => {},
			workspaceId: "workspace_1",
		});

		expect(mocked).toHaveBeenCalledExactlyOnceWith({
			error: undefined,
			event: "recording_transcription",
			fields: {
				attempt: 2,
				duration_ms: 1234,
				item_id: "item_1",
				workflow_id: "wf_1",
				workspace_id: "workspace_1",
			},
			schedule: expect.any(Function),
		});
	});

	it("records a failed run with the error object so the failure is traceable", () => {
		const error = new Error("transcription failed");

		recordWorkspaceRecordingTranscriptionOutcome({
			attempt: 1,
			durationMs: 50,
			error,
			instanceId: "wf_2",
			itemId: "item_2",
			schedule: () => {},
			workspaceId: null,
		});

		expect(mocked).toHaveBeenCalledExactlyOnceWith({
			error,
			event: "recording_transcription",
			fields: {
				attempt: 1,
				duration_ms: 50,
				item_id: "item_2",
				workflow_id: "wf_2",
				workspace_id: null,
			},
			schedule: expect.any(Function),
		});
	});
});
