import { useQuery } from "@tanstack/react-query";
import { AlertCircle, LoaderCircle, Mic } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { Button } from "#/components/ui/button";
import type { WorkspaceItem } from "#/features/workspaces/contracts";
import { getRecording } from "#/features/workspaces/recordings/workspace-recording-client";
import { formatRecordingTimestamp } from "#/features/workspaces/recordings/workspace-recording-transcript";

export function WorkspaceRecordingViewer({
	item,
	workspaceId,
}: {
	item: WorkspaceItem;
	workspaceId: string;
}) {
	const audioRef = useRef<HTMLAudioElement>(null);
	const [activeSequence, setActiveSequence] = useState(0);
	const recordingQuery = useQuery({
		queryKey: ["workspace-recording", workspaceId, item.id],
		queryFn: () => getRecording(workspaceId, item.id),
		refetchInterval: (query) => {
			const status = query.state.data?.status;
			return status === "recording" || status === "processing" ? 3_000 : false;
		},
	});
	const recording = recordingQuery.data;
	const offsets = useMemo(
		() => getSegmentOffsets(recording?.segments ?? []),
		[recording?.segments],
	);

	const playCue = async (sequence: number, startMs: number) => {
		setActiveSequence(sequence);
		await new Promise<void>((resolve) => window.setTimeout(resolve));
		const audio = audioRef.current;
		if (!audio) return;
		audio.currentTime = Math.max(0, (startMs - (offsets.get(sequence) ?? 0)) / 1_000);
		await audio.play();
	};

	const playNextSegment = () => {
		const segments = recording?.segments ?? [];
		const currentIndex = segments.findIndex((segment) => segment.sequence === activeSequence);
		const next = segments[currentIndex + 1];
		if (!next) return;
		setActiveSequence(next.sequence);
		window.setTimeout(() => void audioRef.current?.play());
	};

	if (recordingQuery.isPending) {
		return (
			<RecordingState
				icon={<LoaderCircle className="size-6 animate-spin" />}
				text="Loading recording…"
			/>
		);
	}
	if (recordingQuery.isError || !recording) {
		return (
			<RecordingState
				icon={<AlertCircle className="size-6" />}
				text="Unable to load this recording."
			/>
		);
	}

	return (
		<section className="h-full min-h-0 overflow-y-auto bg-background">
			<div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-10">
				<header className="space-y-2">
					<div className="flex items-center gap-2 text-muted-foreground text-sm">
						<Mic className="size-4 text-rose-500" /> Recording ·{" "}
						{formatRecordingTimestamp(recording.durationMs)}
					</div>
					<h1 className="text-2xl font-semibold tracking-tight">{item.name}</h1>
				</header>

				{recording.segments.length > 0 ? (
					<audio
						ref={audioRef}
						controls
						className="w-full"
						src={`/api/v1/workspaces/${workspaceId}/recordings/${item.id}/segments/${activeSequence}`}
						onEnded={playNextSegment}
					/>
				) : null}

				{recording.status === "recording" ? (
					<RecordingNotice text="Recording is still in progress or waiting to be recovered on the device that captured it." />
				) : null}
				{recording.status === "processing" ? (
					<RecordingNotice text="Transcribing the saved audio. This continues even if you close the computer." />
				) : null}
				{recording.status === "failed" ? (
					<RecordingNotice
						text={recording.errorMessage ?? "Transcription failed. The audio is still available."}
						destructive
					/>
				) : null}

				{recording.transcript.cues.length > 0 ? (
					<div className="space-y-1" aria-label="Transcript">
						{recording.transcript.cues.map((cue, index) => (
							<Button
								key={`${cue.segmentSequence}:${cue.startMs}:${index}`}
								variant="ghost"
								className="h-auto w-full items-start justify-start gap-4 px-3 py-2 text-left font-normal whitespace-normal"
								onClick={() => void playCue(cue.segmentSequence, cue.startMs)}
							>
								<span className="w-12 shrink-0 font-mono text-muted-foreground text-xs leading-5">
									{formatRecordingTimestamp(cue.startMs)}
								</span>
								<span className="leading-5">{cue.text}</span>
							</Button>
						))}
					</div>
				) : recording.status === "ready" ? (
					<p className="text-muted-foreground text-sm">No speech was detected in this recording.</p>
				) : null}
			</div>
		</section>
	);
}

function RecordingNotice({ text, destructive = false }: { text: string; destructive?: boolean }) {
	return (
		<div
			className={
				destructive
					? "rounded-lg bg-destructive/10 p-4 text-destructive text-sm"
					: "rounded-lg bg-muted p-4 text-muted-foreground text-sm"
			}
		>
			{text}
		</div>
	);
}

function RecordingState({ icon, text }: { icon: React.ReactNode; text: string }) {
	return (
		<div className="flex h-full items-center justify-center">
			<div className="flex items-center gap-3 text-muted-foreground">
				{icon}
				{text}
			</div>
		</div>
	);
}

function getSegmentOffsets(segments: readonly { durationMs: number; sequence: number }[]) {
	let elapsed = 0;
	const offsets = new Map<number, number>();
	for (const segment of segments) {
		offsets.set(segment.sequence, elapsed);
		elapsed += segment.durationMs;
	}
	return offsets;
}
