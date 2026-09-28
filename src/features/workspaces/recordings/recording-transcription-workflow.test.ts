import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkflowEvent, WorkflowStep } from "cloudflare:workers";

const persistence = vi.hoisted(() => ({
	failWorkspaceRecording: vi.fn(),
	publishWorkspaceRecordingTranscript: vi.fn(),
	readWorkspaceRecordingForTranscription: vi.fn(),
}));
const observability = vi.hoisted(() => ({
	recordWorkspaceRecordingTranscriptionOutcome: vi.fn(),
}));
const timeline = vi.hoisted(() => ({
	buildWorkspaceRecordingTranscript: vi.fn(() => ({ cues: [] })),
}));

vi.mock("#/features/workspaces/recordings/workspace-recording-persistence", () => persistence);
vi.mock("#/features/workspaces/recordings/workspace-recording-observability", () => observability);
vi.mock("#/features/workspaces/recordings/workspace-recording-timeline", () => timeline);
vi.mock("cloudflare:workers", () => ({
	WorkflowEntrypoint: class {
		ctx: unknown;
		env: unknown;
		constructor(ctx: unknown, env: unknown) {
			this.ctx = ctx;
			this.env = env;
		}
	},
}));

import {
	RecordingTranscriptionWorkflow,
	type RecordingTranscriptionWorkflowParams,
} from "#/features/workspaces/recordings/recording-transcription-workflow";

const attempt = 2;
const itemId = "item_1";
const eventTimestamp = new Date("2026-01-01T00:00:00.000Z");

interface RecordingStub {
	durationMs: number;
	mimeType: string;
	objectKey: string | null;
	status: string;
	transcriptionAttempt: number;
	workspaceId: string;
}

function createRecording(overrides: Partial<RecordingStub> = {}): RecordingStub {
	return {
		durationMs: 5000,
		mimeType: "audio/webm",
		objectKey: "recordings/item_1.webm",
		status: "processing",
		transcriptionAttempt: attempt,
		workspaceId: "workspace_1",
		...overrides,
	};
}

function createStep() {
	const names: string[] = [];
	const step = {
		async do(name: string, first: unknown, second?: unknown) {
			names.push(name);
			const callback = typeof first === "function" ? first : second;
			return await (callback as () => Promise<unknown>)();
		},
	};
	return { names, step };
}

function createWorkflow() {
	const waitUntil = vi.fn();
	const env = { AI: { run: vi.fn() }, WORKSPACE_FILES: { get: vi.fn() } };
	const workflow = new RecordingTranscriptionWorkflow({ waitUntil } as never, env as never);
	return { env, waitUntil, workflow };
}

function createEvent(): Readonly<WorkflowEvent<RecordingTranscriptionWorkflowParams>> {
	return {
		instanceId: "wf_1",
		payload: { attempt, itemId },
		timestamp: eventTimestamp,
		workflowName: "recording-transcription",
	};
}

describe("RecordingTranscriptionWorkflow telemetry", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-01-01T00:01:40.000Z"));
		persistence.failWorkspaceRecording.mockReset().mockResolvedValue(undefined);
		persistence.publishWorkspaceRecordingTranscript.mockReset();
		persistence.readWorkspaceRecordingForTranscription.mockReset();
		observability.recordWorkspaceRecordingTranscriptionOutcome.mockReset();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("records a failure with the workspace and the elapsed-since-event duration", async () => {
		persistence.readWorkspaceRecordingForTranscription.mockResolvedValue(
			createRecording({ objectKey: null }),
		);
		const { step } = createStep();
		const { workflow } = createWorkflow();

		await workflow.run(createEvent(), step as unknown as WorkflowStep);

		expect(
			observability.recordWorkspaceRecordingTranscriptionOutcome,
		).toHaveBeenCalledExactlyOnceWith({
			attempt,
			durationMs: 100_000,
			error: expect.any(Error),
			instanceId: "wf_1",
			itemId,
			schedule: expect.any(Function),
			workspaceId: "workspace_1",
		});
	});

	it("records the failure outcome even when marking the row failed rejects", async () => {
		persistence.readWorkspaceRecordingForTranscription.mockResolvedValue(
			createRecording({ objectKey: null }),
		);
		persistence.failWorkspaceRecording.mockRejectedValue(new Error("database unavailable"));
		const { step } = createStep();
		const { workflow } = createWorkflow();

		await expect(workflow.run(createEvent(), step as unknown as WorkflowStep)).rejects.toThrow(
			"database unavailable",
		);
		expect(observability.recordWorkspaceRecordingTranscriptionOutcome).toHaveBeenCalledOnce();
		expect(
			observability.recordWorkspaceRecordingTranscriptionOutcome.mock.calls[0]?.[0],
		).toMatchObject({ attempt, itemId, workspaceId: "workspace_1" });
	});

	it("records a success with the workspace and the elapsed-since-event duration", async () => {
		persistence.readWorkspaceRecordingForTranscription.mockResolvedValue(createRecording());
		persistence.publishWorkspaceRecordingTranscript.mockResolvedValue("applied");
		const { env, workflow } = createWorkflow();
		env.WORKSPACE_FILES.get.mockResolvedValue({ body: "audio", etag: "etag_1" });
		env.AI.run.mockResolvedValue({ text: "hello" });
		const { step } = createStep();

		await workflow.run(createEvent(), step as unknown as WorkflowStep);

		expect(
			observability.recordWorkspaceRecordingTranscriptionOutcome,
		).toHaveBeenCalledExactlyOnceWith({
			attempt,
			durationMs: 100_000,
			instanceId: "wf_1",
			itemId,
			schedule: expect.any(Function),
			workspaceId: "workspace_1",
		});
	});
});
