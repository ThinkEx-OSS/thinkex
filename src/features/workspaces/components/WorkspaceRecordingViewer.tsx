import { CompletedRecordingUpload } from "#/features/workspaces/components/CompletedRecordingUpload";
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
import { scaleRecordingWaveformAmplitude } from "#/features/workspaces/recordings/workspace-recording";
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
	const pending = capture.pendingUploads.find(({ recording }) => recording.itemId === item.id);
	if (pending)
		return (
			<CompletedRecordingUpload
				blob={pending.recording.blob}
				busy={pending.status !== "failed"}
				name={item.name}
				onRetry={() => capture.retryUpload(pending.recording)}
				onDiscard={() => capture.discardUpload(pending.recording)}
			/>
		);
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
	if (!recording.hasAudio && (!capture.canCapture || !capabilities.canMutateContent))
		return (
			<RecordingItemSurface>
				<RecordingNotice text="No audio has been saved. New recording is temporarily unavailable." />
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
			{recording.status !== "ready" ? (
				<div className="mx-auto w-full max-w-3xl space-y-3">
					<RecordingNotice
						destructive={recording.status === "failed"}
						text={
							recording.status === "processing"
								? "Creating transcript…"
								: (recording.errorMessage ?? "Audio saved. Start transcription when ready.")
						}
					/>
					{capabilities.canMutateContent && recording.status !== "processing" ? (
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
					) : null}
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
	phase: ReturnType<typeof useWorkspaceRecording>["phase"];
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
					{phase === "finishing" || phase === "starting" ? (
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
									: phase === "starting"
										? "Starting microphone…"
										: "Saving…"}
					</p>
				</div>
				{phase === "recording" || phase === "paused" ? (
					<RecordingWaveform analyser={analyser} paused={phase === "paused"} />
				) : null}
				{phase === "setup" ? (
					<div className="space-y-3">
						<p className="max-w-sm text-muted-foreground text-sm">
							Finish with Done before leaving this workspace. Keep this tab open until audio is
							saved. Recording stops automatically after 3 hours.
						</p>
						<Button onClick={onStart}>Start recording</Button>
					</div>
				) : phase === "recording" || phase === "paused" ? (
					<div className="flex items-center gap-2">
						<Button variant="outline" onClick={phase === "paused" ? onResume : onPause}>
							{phase === "paused" ? (
								<Play className="size-4 fill-current" />
							) : (
								<Pause className="size-4 fill-current" />
							)}
							{phase === "paused" ? "Unpause" : "Pause"}
						</Button>
						<Button onClick={onStop}>
							<Square className="size-3 fill-current" /> Done
						</Button>
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
	const barsRef = useRef<HTMLDivElement>(null);
	useEffect(() => {
		const bars = barsRef.current;
		if (!analyser || !bars || paused) return;
		const samples = new Uint8Array(analyser.frequencyBinCount);
		const amplitudes = new Float32Array(32);
		const timer = window.setInterval(() => {
			if (!bars.clientWidth) return;
			analyser.getByteTimeDomainData(samples);
			let sumSquares = 0;
			let peak = 0;
			for (const sample of samples) {
				const value = Math.abs(sample - 128) / 128;
				sumSquares += value * value;
				peak = Math.max(peak, value);
			}
			amplitudes.copyWithin(0, 1);
			amplitudes[31] = scaleRecordingWaveformAmplitude(
				Math.sqrt(sumSquares / samples.length) * 0.75 + peak * 0.25,
			);
			Array.from(bars.children).forEach((bar, index) => {
				if (bar instanceof HTMLElement)
					bar.style.height = `${Math.max(4, amplitudes[index] * 80)}%`;
			});
		}, 40);
		return () => window.clearInterval(timer);
	}, [analyser, paused]);

	return (
		<div
			ref={barsRef}
			className={`flex h-12 w-full max-w-80 items-center gap-1 text-rose-500 transition-opacity ${paused ? "opacity-45" : "opacity-100"}`}
			aria-hidden="true"
		>
			{Array.from({ length: 32 }, (_, index) => (
				<span
					key={index}
					className="min-w-0 flex-1 rounded-full bg-current motion-safe:transition-[height] motion-safe:duration-100"
					style={{ height: "4%", opacity: 0.35 + 0.65 * (index / 31) }}
				/>
			))}
		</div>
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
