import { useQuery } from "@tanstack/react-query";
import { AlertCircle, LoaderCircle, Mic, Pause, Play, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "#/components/ui/button";
import { useWorkspaceMutationAccess } from "#/features/workspaces/components/workspace-mutation-access";
import { useWorkspaceRecording } from "#/features/workspaces/components/WorkspaceRecordingProvider";
import type { WorkspaceItem } from "#/features/workspaces/contracts";
import {
	getRecording,
	retryRecordingTranscription,
} from "#/features/workspaces/recordings/workspace-recording-client";
import {
	easeRecordingWaveformAmplitude,
	scaleRecordingWaveformAmplitude,
} from "#/features/workspaces/recordings/workspace-recording";
import { formatRecordingTimestamp } from "#/features/workspaces/recordings/workspace-recording-transcript";

/** Record, retry a completed upload, or play a single audio file and its transcript. */
export function WorkspaceRecordingViewer({
	item,
	workspaceId,
}: {
	item: WorkspaceItem;
	workspaceId: string;
}) {
	const capture = useWorkspaceRecording();
	const { capabilities } = useWorkspaceMutationAccess();
	const audioRef = useRef<HTMLAudioElement>(null);
	const [retrying, setRetrying] = useState(false);
	const recordingQuery = useQuery({
		queryKey: ["workspace-recording", workspaceId, item.id],
		queryFn: () => getRecording(workspaceId, item.id),
		refetchInterval: (query) => (query.state.data?.status === "processing" ? 3_000 : false),
	});
	const recording = recordingQuery.data;
	if (capture.captureItemId === item.id)
		return (
			<RecordingCaptureSurface
				analyser={capture.analyser}
				phase={capture.phase}
				elapsedMs={capture.elapsedMs}
				onPause={capture.pauseRecording}
				onResume={capture.resumeRecording}
				onStart={() => capture.startRecording()}
				onStop={capture.stopRecording}
			/>
		);
	if (capture.pendingUpload?.itemId === item.id)
		return (
			<CompletedRecordingUpload
				blob={capture.pendingUpload.blob}
				name={item.name}
				onRetry={capture.retryUpload}
			/>
		);
	if (recordingQuery.isPending)
		return (
			<RecordingState
				icon={<LoaderCircle className="size-5 animate-spin" />}
				text="Loading recording…"
			/>
		);
	if (!recording)
		return (
			<RecordingState icon={<AlertCircle className="size-5" />} text="Couldn’t load recording." />
		);
	if (!recording.hasAudio && !capabilities.canMutateContent)
		return (
			<RecordingItemSurface>
				<RecordingNotice text="No audio has been recorded yet." />
			</RecordingItemSurface>
		);
	if (!recording.hasAudio)
		return (
			<RecordingCaptureSurface
				analyser={null}
				phase="setup"
				elapsedMs={0}
				onPause={capture.pauseRecording}
				onResume={capture.resumeRecording}
				onStart={() => capture.startRecording(item, recording.mimeType)}
				onStop={capture.stopRecording}
			/>
		);
	return (
		<RecordingItemSurface>
			<audio
				ref={audioRef}
				controls
				preload="metadata"
				className="mx-auto w-full max-w-3xl"
				src={`/api/v1/workspaces/${workspaceId}/recordings/${item.id}/audio`}
			/>
			{recording.status === "processing" ? <RecordingNotice text="Creating transcript…" /> : null}
			{capabilities.canMutateContent &&
			(recording.status === "failed" || recording.status === "recording") ? (
				<div className="mx-auto w-full max-w-3xl space-y-3">
					<RecordingNotice
						destructive
						text={recording.errorMessage ?? "Audio saved. Start transcription when ready."}
					/>
					<Button
						disabled={retrying}
						onClick={() => {
							setRetrying(true);
							void retryRecordingTranscription(workspaceId, item.id)
								.then(() => recordingQuery.refetch())
								.catch((error: unknown) =>
									toast.error(
										error instanceof Error ? error.message : "Couldn’t retry transcription.",
									),
								)
								.finally(() => setRetrying(false));
						}}
					>
						Retry transcription
					</Button>
				</div>
			) : null}
			<div className="mx-auto w-full max-w-3xl space-y-1" aria-label="Transcript">
				{recording.transcript.cues.map((cue, index) => (
					<Button
						key={index}
						variant="ghost"
						className="h-auto w-full items-start justify-start gap-4 px-3 py-2 text-left font-normal whitespace-normal"
						onClick={() => {
							const audio = audioRef.current;
							if (!audio) return;
							audio.currentTime = cue.startMs / 1_000;
							void audio.play().catch(() => toast.error("Couldn’t play recording."));
						}}
					>
						<span className="w-12 shrink-0 font-mono text-muted-foreground text-xs leading-5">
							{formatRecordingTimestamp(cue.startMs)}
						</span>
						<span className="leading-5">{cue.text}</span>
					</Button>
				))}
				{recording.status === "ready" && recording.transcript.cues.length === 0 ? (
					<p className="text-muted-foreground text-sm">No speech was detected.</p>
				) : null}
			</div>
		</RecordingItemSurface>
	);
}

function CompletedRecordingUpload({
	blob,
	name,
	onRetry,
}: {
	blob: Blob;
	name: string;
	onRetry: () => void;
}) {
	const audioRef = useRef<HTMLAudioElement>(null);
	const downloadRef = useRef<HTMLAnchorElement>(null);
	useEffect(() => {
		const next = URL.createObjectURL(blob);
		if (audioRef.current) audioRef.current.src = next;
		if (downloadRef.current) downloadRef.current.href = next;
		return () => URL.revokeObjectURL(next);
	}, [blob]);
	return (
		<RecordingItemSurface>
			<RecordingNotice text="Recording finished. Retry the upload or download your audio." />
			<audio ref={audioRef} controls className="mx-auto w-full max-w-3xl" />
			<div className="mx-auto flex gap-3">
				<Button onClick={onRetry}>Retry upload</Button>
				<a
					className="inline-flex items-center text-sm underline"
					ref={downloadRef}
					download={`${name}.${blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm"}`}
				>
					Download audio
				</a>
			</div>
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
					<div className="space-y-3">
						<p className="max-w-sm text-muted-foreground text-sm">
							Audio is saved after Done. Keep this workspace open while recording. Recording stops
							automatically after 3 hours.
						</p>
						<Button onClick={onStart}>Start recording</Button>
					</div>
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
