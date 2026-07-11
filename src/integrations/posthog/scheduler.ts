import { waitUntil } from "cloudflare:workers";

export type PostHogTelemetryScheduler = (task: Promise<void>) => void;

interface SchedulePostHogCaptureInput {
	context: Record<string, unknown>;
	schedule?: PostHogTelemetryScheduler;
	task: Promise<void>;
}

export function schedulePostHogCapture({
	context,
	schedule = scheduleWithWorkerWaitUntil,
	task,
}: SchedulePostHogCaptureInput) {
	const handledTask = task.catch((error) => {
		console.error({
			event: "posthog_delivery",
			outcome: "error",
			...context,
			error_type: error instanceof Error ? error.name : "UnknownError",
		});
	});

	try {
		schedule(handledTask);
	} catch (error) {
		console.error({
			event: "posthog_scheduling",
			outcome: "error",
			...context,
			error_type: error instanceof Error ? error.name : "UnknownError",
		});
		void handledTask;
	}
}

function scheduleWithWorkerWaitUntil(task: Promise<void>) {
	waitUntil(task);
}
