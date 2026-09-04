import { useQuery } from "@tanstack/react-query";
import { AlertCircle, LoaderCircle, Mic, Pause, Play, Square } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { Button } from "#/components/ui/button";
import { useWorkspaceRecording } from "#/features/workspaces/components/WorkspaceRecordingProvider";
import type { WorkspaceItem } from "#/features/workspaces/contracts";
import { getRecording } from "#/features/workspaces/recordings/workspace-recording-client";
import { getWorkspaceRecordingSegmentAtTime } from "#/features/workspaces/recordings/workspace-recording-timeline";
import { formatRecordingTimestamp } from "#/features/workspaces/recordings/workspace-recording-transcript";

export function WorkspaceRecordingViewer({
	item,
	workspaceId,
}: {
	item: WorkspaceItem;
	workspaceId: string;
}) {
	const capture = useWorkspaceRecording();
	const audioRef = useRef<HTMLAudioElement>(null);
	const continuePlaybackRef = useRef(false);
	const [activeSequence, setActiveSequence] = useState(0);
	const [isPlaying, setIsPlaying] = useState(false);
	const [playbackMs, setPlaybackMs] = useState(0);
	const [playbackRate, setPlaybackRate] = useState(1);
	const pendingSeekRef = useRef<number | null>(null);
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
	if (capture.captureItemId === item.id) {
		return (
			<RecordingCaptureSurface
				phase={capture.phase}
				elapsedMs={capture.elapsedMs}
				onStart={capture.startRecording}
				onStop={capture.stopRecording}
			/>
		);
	}
	if (capture.recovery?.itemId === item.id) {
		return (
			<RecordingRecoverySurface
				durationMs={capture.recovery.durationMs}
				segmentCount={capture.recovery.segmentCount}
				onRecover={capture.recoverRecording}
			/>
		);
	}

	const playCue = async (sequence: number, startMs: number) => {
		seekTo(startMs, true, sequence);
	};

	const seekTo = (targetMs: number, play = isPlaying, sequence?: number) => {
		const targetSequence =
			sequence ?? getWorkspaceRecordingSegmentAtTime(recording?.segments ?? [], targetMs);
		pendingSeekRef.current = targetMs;
		continuePlaybackRef.current = play;
		setPlaybackMs(targetMs);
		if (targetSequence !== activeSequence) {
			setActiveSequence(targetSequence);
			return;
		}
		applyPendingSeek();
	};

	const applyPendingSeek = () => {
		const audio = audioRef.current;
		const targetMs = pendingSeekRef.current;
		if (!audio) return;
		pendingSeekRef.current = null;
		audio.playbackRate = playbackRate;
		if (targetMs !== null) {
			audio.currentTime = Math.max(0, (targetMs - (offsets.get(activeSequence) ?? 0)) / 1_000);
		}
		if (continuePlaybackRef.current) {
			continuePlaybackRef.current = false;
			void audio.play();
		}
	};

	const playNextSegment = () => {
		const segments = recording?.segments ?? [];
		const currentIndex = segments.findIndex((segment) => segment.sequence === activeSequence);
		const next = segments[currentIndex + 1];
		if (!next) return;
		pendingSeekRef.current = offsets.get(next.sequence) ?? playbackMs;
		continuePlaybackRef.current = true;
		setActiveSequence(next.sequence);
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
		<RecordingItemSurface>
			{recording.segments.length > 0 ? (
				<>
					<audio
						ref={audioRef}
						preload="metadata"
						src={`/api/v1/workspaces/${workspaceId}/recordings/${item.id}/segments/${activeSequence}`}
						onEnded={playNextSegment}
						onLoadedMetadata={applyPendingSeek}
						onPause={() => setIsPlaying(false)}
						onPlay={() => setIsPlaying(true)}
						onTimeUpdate={(event) =>
							setPlaybackMs(
								(offsets.get(activeSequence) ?? 0) + event.currentTarget.currentTime * 1_000,
							)
						}
					/>
					<div className="flex items-center gap-3 rounded-xl border bg-card p-3 shadow-sm">
						<Button
							size="icon"
							className="shrink-0 rounded-full"
							aria-label={isPlaying ? "Pause recording" : "Play recording"}
							onClick={() => {
								const audio = audioRef.current;
								if (!audio) return;
								if (isPlaying) audio.pause();
								else void audio.play();
							}}
						>
							{isPlaying ? (
								<Pause className="size-4 fill-current" />
							) : (
								<Play className="size-4 fill-current" />
							)}
						</Button>
						<span className="w-10 shrink-0 font-mono text-muted-foreground text-xs">
							{formatRecordingTimestamp(playbackMs)}
						</span>
						<input
							type="range"
							min={0}
							max={Math.max(1, recording.durationMs)}
							value={Math.min(playbackMs, recording.durationMs)}
							aria-label="Recording position"
							className="min-w-0 flex-1 accent-primary"
							onChange={(event) => seekTo(Number(event.target.value))}
						/>
						<span className="w-10 shrink-0 text-right font-mono text-muted-foreground text-xs">
							{formatRecordingTimestamp(recording.durationMs)}
						</span>
						<Button
							variant="ghost"
							size="sm"
							className="w-12 shrink-0 tabular-nums"
							aria-label={`Playback speed ${playbackRate} times`}
							onClick={() => {
								const nextRate = playbackRate === 2 ? 1 : playbackRate + 0.25;
								setPlaybackRate(nextRate);
								if (audioRef.current) audioRef.current.playbackRate = nextRate;
							}}
						>
							{playbackRate}×
						</Button>
					</div>
				</>
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
		</RecordingItemSurface>
	);
}

function RecordingCaptureSurface({
	phase,
	elapsedMs,
	onStart,
	onStop,
}: {
	phase: "setup" | "recording" | "finishing";
	elapsedMs: number;
	onStart: () => void;
	onStop: () => void;
}) {
	return (
		<RecordingItemSurface>
			<div className="flex flex-col items-center gap-5 rounded-xl border bg-muted/30 px-6 py-10 text-center">
				<div className="flex size-20 items-center justify-center rounded-full bg-rose-500/10 text-rose-600">
					{phase === "finishing" ? (
						<LoaderCircle className="size-8 animate-spin" />
					) : (
						<Mic className="size-8" />
					)}
				</div>
				<div className="space-y-1">
					<p className="font-medium">
						{phase === "setup"
							? "Default microphone"
							: phase === "recording"
								? formatRecordingTimestamp(elapsedMs)
								: "Saving and starting transcription…"}
					</p>
					<p className="max-w-md text-muted-foreground text-sm">
						{phase === "setup"
							? "Your browser will ask for microphone access. Completed audio is saved in recoverable segments."
							: phase === "recording"
								? "You can leave this item open or work elsewhere in the workspace."
								: "Processing continues after the upload finishes."}
					</p>
				</div>
				{phase === "setup" ? (
					<Button onClick={onStart}>Start recording</Button>
				) : (
					<Button variant="destructive" disabled={phase === "finishing"} onClick={onStop}>
						<Square className="size-3 fill-current" /> Stop and transcribe
					</Button>
				)}
			</div>
		</RecordingItemSurface>
	);
}

function RecordingRecoverySurface({
	durationMs,
	segmentCount,
	onRecover,
}: {
	durationMs: number;
	segmentCount: number;
	onRecover: (mode: "resume" | "finish") => void;
}) {
	const hasAudio = segmentCount > 0;
	return (
		<RecordingItemSurface>
			<div className="space-y-4 rounded-xl border bg-muted/30 p-6">
				<div className="space-y-1">
					<h2 className="font-medium">
						{hasAudio ? "Continue this recording" : "Start this recording"}
					</h2>
					<p className="text-muted-foreground text-sm">
						{hasAudio
							? `${formatRecordingTimestamp(durationMs)} of completed audio is safe on this device. Resume recording or upload it now for transcription.`
							: "Your browser will ask for microphone access when recording starts."}
					</p>
				</div>
				<div className="flex flex-wrap gap-2">
					{hasAudio ? (
						<Button variant="outline" onClick={() => onRecover("finish")}>
							Finish and transcribe
						</Button>
					) : null}
					<Button onClick={() => onRecover("resume")}>
						{hasAudio ? "Resume recording" : "Start recording"}
					</Button>
				</div>
			</div>
		</RecordingItemSurface>
	);
}

function RecordingItemSurface({ children }: { children: React.ReactNode }) {
	return (
		<section className="h-full min-h-0 overflow-y-auto bg-background">
			<div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-8">{children}</div>
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
