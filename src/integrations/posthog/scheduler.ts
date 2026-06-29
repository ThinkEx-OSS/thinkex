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
		console.error("PostHog capture failed.", {
			...context,
			error,
		});
	});

	try {
		schedule(handledTask);
	} catch (error) {
		console.warn("PostHog capture could not be scheduled.", {
			...context,
			error,
		});
		void handledTask;
	}
}

function scheduleWithWorkerWaitUntil(task: Promise<void>) {
	waitUntil(task);
}
