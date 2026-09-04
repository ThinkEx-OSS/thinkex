import { useQuery } from "@tanstack/react-query";
import { AlertCircle, LoaderCircle, Mic, Pause, Play, Square } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "#/components/ui/button";
import { useWorkspaceRecording } from "#/features/workspaces/components/WorkspaceRecordingProvider";
import type { WorkspaceItem } from "#/features/workspaces/contracts";
import { getRecording } from "#/features/workspaces/recordings/workspace-recording-client";
import {
	easeRecordingWaveformAmplitude,
	scaleRecordingWaveformAmplitude,
} from "#/features/workspaces/recordings/workspace-recording";
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
				analyser={capture.analyser}
				phase={capture.phase}
				elapsedMs={capture.elapsedMs}
				onPause={capture.pauseRecording}
				onResume={capture.resumeRecording}
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
					<div className="mx-auto flex w-full max-w-3xl items-center gap-3 py-2">
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

			{recording.status === "recording" ? <RecordingNotice text="Recording not finished." /> : null}
			{recording.status === "processing" ? <RecordingNotice text="Creating transcript…" /> : null}
			{recording.status === "failed" ? (
				<RecordingNotice
					text={recording.errorMessage ?? "Transcript failed. Audio is still available."}
					destructive
				/>
			) : null}

			{recording.transcript.cues.length > 0 ? (
				<div className="mx-auto w-full max-w-3xl space-y-1" aria-label="Transcript">
					{recording.transcript.cues.map((cue, index) => (
						<Button
							key={`${cue.segmentSequence}:${cue.startMs}:${index}`}
							variant="ghost"
							className="h-auto w-full items-start justify-start gap-4 px-3 py-2 text-left font-normal whitespace-normal"
							onClick={() => seekTo(cue.startMs, true, cue.segmentSequence)}
						>
							<span className="w-12 shrink-0 font-mono text-muted-foreground text-xs leading-5">
								{formatRecordingTimestamp(cue.startMs)}
							</span>
							<span className="leading-5">{cue.text}</span>
						</Button>
					))}
				</div>
			) : recording.status === "ready" ? (
				<p className="mx-auto w-full max-w-3xl text-muted-foreground text-sm">
					No speech was detected in this recording.
				</p>
			) : null}
		</RecordingItemSurface>
	);
}

function RecordingCaptureSurface({
	analyser,
	phase,
	elapsedMs,
	onPause,
	onResume,
	onStart,
	onStop,
}: {
	analyser: AnalyserNode | null;
	phase: "setup" | "recording" | "paused" | "finishing";
	elapsedMs: number;
	onPause: () => void;
	onResume: () => void;
	onStart: () => void;
	onStop: () => void;
}) {
	return (
		<RecordingItemSurface>
			<div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 py-10 text-center">
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
							? "Ready to record"
							: phase === "recording"
								? formatRecordingTimestamp(elapsedMs)
								: phase === "paused"
									? `${formatRecordingTimestamp(elapsedMs)} · Paused`
									: "Saving…"}
					</p>
				</div>
				{phase === "recording" || phase === "paused" ? (
					<RecordingWaveform analyser={analyser} paused={phase === "paused"} />
				) : null}
				{phase === "setup" ? (
					<Button onClick={onStart}>Start recording</Button>
				) : phase === "recording" ? (
					<div className="flex items-center gap-2">
						<Button variant="outline" onClick={onPause}>
							<Pause className="size-4 fill-current" /> Pause
						</Button>
						<Button onClick={onStop}>
							<Square className="size-3 fill-current" /> Done
						</Button>
					</div>
				) : phase === "paused" ? (
					<div className="flex items-center gap-2">
						<Button variant="outline" onClick={onResume}>
							<Play className="size-4 fill-current" /> Unpause
						</Button>
						<Button onClick={onStop}>Done</Button>
					</div>
				) : null}
			</div>
		</RecordingItemSurface>
	);
}

function RecordingWaveform({
	analyser,
	paused,
}: {
	analyser: AnalyserNode | null;
	paused: boolean;
}) {
	const canvasRef = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!analyser || !canvas) return;
		const context = canvas.getContext("2d");
		if (!context) return;
		const samples = new Uint8Array(analyser.frequencyBinCount);
		const barCount = 32;
		const targetAmplitudes = new Float32Array(barCount);
		const displayedAmplitudes = new Float32Array(barCount);
		let animationFrame = 0;
		let lastFrameAt = performance.now();
		let lastSampleAt = 0;

		const draw = (now: number) => {
			const scale = window.devicePixelRatio || 1;
			const width = Math.max(1, Math.round(canvas.clientWidth * scale));
			const height = Math.max(1, Math.round(canvas.clientHeight * scale));
			if (canvas.width !== width || canvas.height !== height) {
				canvas.width = width;
				canvas.height = height;
			}
			if (now - lastSampleAt >= 40) {
				analyser.getByteTimeDomainData(samples);
				let sumSquares = 0;
				let peak = 0;
				for (const sample of samples) {
					const value = Math.abs(sample - 128) / 128;
					sumSquares += value * value;
					peak = Math.max(peak, value);
				}
				const rms = Math.sqrt(sumSquares / samples.length);
				targetAmplitudes.copyWithin(0, 1);
				targetAmplitudes[barCount - 1] = scaleRecordingWaveformAmplitude(rms * 0.75 + peak * 0.25);
				lastSampleAt = now;
			}

			context.clearRect(0, 0, width, height);
			context.fillStyle = getComputedStyle(canvas).color;
			const gap = 4 * scale;
			const barWidth = (width - gap * (barCount - 1)) / barCount;
			const elapsedMs = Math.min(50, now - lastFrameAt);
			for (let bar = 0; bar < barCount; bar += 1) {
				displayedAmplitudes[bar] = easeRecordingWaveformAmplitude(
					displayedAmplitudes[bar],
					targetAmplitudes[bar],
					elapsedMs,
				);
				const barHeight = Math.max(2 * scale, displayedAmplitudes[bar] * height * 0.8);
				context.globalAlpha = 0.35 + 0.65 * (bar / (barCount - 1));
				context.beginPath();
				context.roundRect(
					bar * (barWidth + gap),
					(height - barHeight) / 2,
					barWidth,
					barHeight,
					barWidth / 2,
				);
				context.fill();
			}
			context.globalAlpha = 1;
			lastFrameAt = now;
			animationFrame = requestAnimationFrame(draw);
		};

		animationFrame = requestAnimationFrame(draw);
		return () => cancelAnimationFrame(animationFrame);
	}, [analyser]);

	return (
		<canvas
			ref={canvasRef}
			className={`h-12 w-full max-w-80 text-rose-500 transition-opacity ${paused ? "opacity-45" : "opacity-100"}`}
			aria-hidden="true"
		/>
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
			<div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 py-10 text-center">
				<div className="space-y-1">
					<h2 className="font-medium">{hasAudio ? "Recording paused" : "Ready to record"}</h2>
					{hasAudio ? (
						<p className="text-muted-foreground text-sm">
							{formatRecordingTimestamp(durationMs)} recorded
						</p>
					) : null}
				</div>
				<div className="flex flex-wrap justify-center gap-2">
					<Button variant={hasAudio ? "outline" : "default"} onClick={() => onRecover("resume")}>
						{hasAudio ? "Unpause" : "Start recording"}
					</Button>
					{hasAudio ? <Button onClick={() => onRecover("finish")}>Done</Button> : null}
				</div>
			</div>
		</RecordingItemSurface>
	);
}

function RecordingItemSurface({ children }: { children: React.ReactNode }) {
	return (
		<section className="h-full min-h-0 overflow-y-auto bg-background">
			<div className="flex min-h-full w-full flex-col gap-6 px-6 py-8">{children}</div>
		</section>
	);
}

function RecordingNotice({ text, destructive = false }: { text: string; destructive?: boolean }) {
	return (
		<div
			className={
				destructive
					? "mx-auto w-full max-w-3xl rounded-lg bg-destructive/10 p-4 text-destructive text-sm"
					: "mx-auto w-full max-w-3xl text-muted-foreground text-sm"
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
