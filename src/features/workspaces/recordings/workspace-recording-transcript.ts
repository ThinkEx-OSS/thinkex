import { z } from "zod";

const workspaceRecordingTranscriptCueSchema = z.object({
	endMs: z.number().int().nonnegative(),
	segmentSequence: z.number().int().nonnegative(),
	startMs: z.number().int().nonnegative(),
	text: z.string().trim().min(1),
});

const workspaceRecordingTranscriptSchema = z.object({
	cues: z.array(workspaceRecordingTranscriptCueSchema),
});

/** One transcript passage linked to an absolute recording time. */
export type WorkspaceRecordingTranscriptCue = z.infer<typeof workspaceRecordingTranscriptCueSchema>;

/** Persisted time-aligned transcript content for a recording item. */
export type WorkspaceRecordingTranscript = z.infer<typeof workspaceRecordingTranscriptSchema>;

/** Parse stored recording transcript JSON. */
export function parseWorkspaceRecordingTranscript(content: string): WorkspaceRecordingTranscript {
	return workspaceRecordingTranscriptSchema.parse(JSON.parse(content));
}

/** Serialize a recording transcript for workspace item content storage. */
export function stringifyWorkspaceRecordingTranscript(transcript: WorkspaceRecordingTranscript) {
	return `${JSON.stringify(workspaceRecordingTranscriptSchema.parse(transcript))}\n`;
}

/** Build searchable plain text from a recording transcript. */
export function getWorkspaceRecordingTranscriptText(content: string) {
	return parseWorkspaceRecordingTranscript(content)
		.cues.map((cue) => cue.text)
		.join("\n");
}

/** Format a recording transcript as readable timestamped Markdown. */
export function serializeWorkspaceRecordingTranscriptToMarkdown(
	transcript: WorkspaceRecordingTranscript,
) {
	return transcript.cues
		.map((cue) => `**${formatRecordingTimestamp(cue.startMs)}** ${cue.text}`)
		.join("\n\n");
}

/** Format an absolute recording offset for display. */
export function formatRecordingTimestamp(offsetMs: number) {
	const wholeSeconds = Math.max(0, Math.floor(offsetMs / 1_000));
	const hours = Math.floor(wholeSeconds / 3_600);
	const minutes = Math.floor((wholeSeconds % 3_600) / 60);
	const seconds = wholeSeconds % 60;
	return hours > 0
		? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
		: `${minutes}:${String(seconds).padStart(2, "0")}`;
}
