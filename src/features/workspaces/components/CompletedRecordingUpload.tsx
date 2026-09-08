import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { fixWebmDuration } from "@fix-webm-duration/fix";
import { toast } from "sonner";
import { workspaceRecordingMaxBytes } from "#/features/workspaces/recordings/workspace-recording";
import {
	uploadRecording,
	retryRecordingTranscription,
} from "#/features/workspaces/recordings/workspace-recording-client";
import {
	listLocalWorkspaceRecordings,
	saveLocalWorkspaceRecording,
	deleteLocalWorkspaceRecording,
	type LocalWorkspaceRecording,
} from "#/features/workspaces/recordings/workspace-recording-local-store";
import { Button } from "#/components/ui/button";
/** Playback and download remain available even when the workspace item was deleted. */
export function CompletedRecordingUpload({
	blob,
	name,
	onRetry,
	busy,
	onDiscard,
}: {
	blob: Blob;
	name: string;
	onRetry: () => void;
	busy: boolean;
	onDiscard: () => void;
}) {
	const audioRef = useRef<HTMLAudioElement>(null);
	const downloadRef = useRef<HTMLAnchorElement>(null);
	useEffect(() => {
		const next = URL.createObjectURL(blob);
		if (audioRef.current) audioRef.current.src = next;
		if (downloadRef.current) downloadRef.current.href = next;
		return () => URL.revokeObjectURL(next);
	}, [blob]);
	const oversized = blob.size > workspaceRecordingMaxBytes;
	return (
		<div className="flex min-h-full w-full flex-col gap-6 px-6 py-8">
			<audio ref={audioRef} controls className="mx-auto w-full max-w-3xl" />
			<p className="mx-auto w-full max-w-3xl text-muted-foreground text-sm" role="status">
				{busy
					? "Saving recording…"
					: oversized
						? "Audio exceeds 96 MiB. Download it to keep your recording."
						: "Retry the upload or download your audio."}
			</p>
			<div className={busy ? "hidden" : "mx-auto flex w-full max-w-3xl gap-3"}>
				{!oversized && <Button onClick={onRetry}>Retry upload</Button>}
				<a
					className="inline-flex items-center text-sm underline"
					ref={downloadRef}
					download={`${name}.${blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm"}`}
				>
					Download audio
				</a>
				<Button
					variant="ghost"
					onClick={() => {
						if (
							window.confirm(
								"Remove this local copy? Download your audio first if you want to keep it.",
							)
						)
							onDiscard();
					}}
				>
					Remove local copy
				</Button>
			</div>
		</div>
	);
}

type PendingRecording = {
	recording: LocalWorkspaceRecording;
	status: "saving" | "uploading" | "failed";
};

/** Completed files own their persistence and retries independently of microphone capture. */
export function useCompletedRecordings(workspaceId: string, enabled: boolean) {
	const queryClient = useQueryClient();
	const [pendingUploads, setPendingUploads] = useState<PendingRecording[]>([]);
	const unsaved = useRef(new Set<string>());
	useEffect(() => {
		if (!enabled) return;
		let active = true;

		void listLocalWorkspaceRecordings(workspaceId)
			.then((recordings) => {
				if (active)
					setPendingUploads((current) => [
						...current,
						...recordings
							.filter(
								(recording) =>
									!current.some((pending) => pending.recording.itemId === recording.itemId),
							)
							.map((recording) => ({ recording, status: "failed" as const })),
					]);
			})
			.catch(() => undefined);
		return () => {
			active = false;
		};
	}, [workspaceId, enabled]);

	const remember = (recording: LocalWorkspaceRecording, status: PendingRecording["status"]) =>
		setPendingUploads((current) => [
			...current.filter((pending) => pending.recording.itemId !== recording.itemId),
			{ recording, status },
		]);

	const upload = async (recording: LocalWorkspaceRecording) => {
		if (recording.blob.size > workspaceRecordingMaxBytes) {
			remember(recording, "failed");
			return;
		}
		remember(recording, "uploading");
		try {
			await uploadRecording(recording);
		} catch (error) {
			remember(recording, "failed");
			toast.error(
				error instanceof Error ? error.message : "Upload failed. Retry or download your audio.",
			);
			return;
		}
		unsaved.current.delete(recording.itemId);
		// Once audio is on the server, transcription failure must never cause another upload.
		await deleteLocalWorkspaceRecording(recording.itemId).catch(() => undefined);
		try {
			await retryRecordingTranscription(recording.workspaceId, recording.itemId);
		} catch {
			toast.error("Audio saved. Open the recording to retry transcription.");
		}
		await queryClient.invalidateQueries({
			queryKey: ["workspace-recording", recording.workspaceId, recording.itemId],
		});
		setPendingUploads((current) =>
			current.filter((pending) => pending.recording.itemId !== recording.itemId),
		);
	};

	const completeRecording = async (completed: LocalWorkspaceRecording) => {
		unsaved.current.add(completed.itemId);
		remember(completed, "saving");
		// Repair container metadata once. Even if repair fails, retain the original audio.
		const blob = completed.mimeType.includes("webm")
			? await fixWebmDuration(completed.blob, completed.durationMs, { logger: false }).catch(
					() => completed.blob,
				)
			: completed.blob;
		const recording = { ...completed, blob };
		try {
			await saveLocalWorkspaceRecording(recording);
			unsaved.current.delete(recording.itemId);
		} catch {
			toast.warning("Couldn’t save on this device. Keep this tab open until upload finishes.");
		}
		void upload(recording);
	};

	const discard = async (recording: LocalWorkspaceRecording) => {
		try {
			if (!unsaved.current.has(recording.itemId))
				await deleteLocalWorkspaceRecording(recording.itemId);
			unsaved.current.delete(recording.itemId);
			setPendingUploads((current) =>
				current.filter((pending) => pending.recording.itemId !== recording.itemId),
			);
		} catch {
			toast.error("Couldn’t remove the local copy. Try again.");
		}
	};
	return {
		pendingUploads,
		completeRecording,
		upload,
		discard,
		hasUnsavedAudio: () => unsaved.current.size > 0,
	};
}
