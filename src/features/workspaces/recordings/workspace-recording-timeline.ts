/** Convert Whisper timestamps into cues on a single audio timeline. */
export function buildWorkspaceRecordingTranscript(
	result: {
		readonly text: string;
		readonly transcription_info?: { readonly language?: string };
		readonly segments?: readonly { readonly start?: number; readonly text?: string }[];
	},
	durationMs: number,
) {
	const cues = (result.segments ?? []).flatMap((part) => {
		const text = part.text?.trim();
		return text
			? [
					{
						startMs: Math.min(
							Math.max(0, durationMs - 1),
							Math.max(0, Math.round((part.start ?? 0) * 1_000)),
						),
						text,
					},
				]
			: [];
	});
	if (cues.length === 0 && result.text.trim()) cues.push({ startMs: 0, text: result.text.trim() });
	return {
		cues,
		...(result.transcription_info?.language
			? { language: result.transcription_info.language }
			: {}),
	};
}
