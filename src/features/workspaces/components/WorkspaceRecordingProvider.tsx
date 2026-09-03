import { useQueryClient } from "@tanstack/react-query";
import { Mic, Square } from "lucide-react";
import { createContext, type ReactNode, use, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "#/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "#/components/ui/dialog";
import { Input } from "#/components/ui/input";
import { applyWorkspacePageDeltaToCache } from "#/features/workspaces/cache-page";
import { useWorkspaceMutationAccess } from "#/features/workspaces/components/workspace-mutation-access";
import {
	createRecordingItem,
	finalizeRecording,
	getSupportedRecordingMimeType,
	uploadRecordingSegment,
} from "#/features/workspaces/recordings/workspace-recording-client";
import { workspaceRecordingMaxDurationMs } from "#/features/workspaces/recordings/workspace-recording";
import {
	deleteLocalWorkspaceRecording,
	deleteLocalWorkspaceRecordingSegment,
	listLocalWorkspaceRecordings,
	listLocalWorkspaceRecordingSegments,
	saveLocalWorkspaceRecording,
	saveLocalWorkspaceRecordingSegment,
	type LocalWorkspaceRecording,
} from "#/features/workspaces/recordings/workspace-recording-local-store";
import { formatRecordingTimestamp } from "#/features/workspaces/recordings/workspace-recording-transcript";

interface WorkspaceRecordingContextValue {
	requestRecording: (parentId: string | null) => void;
}

const WorkspaceRecordingContext = createContext<WorkspaceRecordingContextValue | null>(null);
const segmentDurationMs = 30_000;

export function WorkspaceRecordingProvider({
	children,
	workspaceId,
}: {
	children: ReactNode;
	workspaceId: string;
}) {
	const queryClient = useQueryClient();
	const { capabilities } = useWorkspaceMutationAccess();
	const [open, setOpen] = useState(false);
	const [parentId, setParentId] = useState<string | null>(null);
	const [name, setName] = useState("Lecture recording");
	const [phase, setPhase] = useState<"setup" | "recording" | "finishing">("setup");
	const [elapsedMs, setElapsedMs] = useState(0);
	const [recovery, setRecovery] = useState<LocalWorkspaceRecording | null>(null);
	const sessionRef = useRef<LocalWorkspaceRecording | null>(null);
	const streamRef = useRef<MediaStream | null>(null);
	const recorderRef = useRef<MediaRecorder | null>(null);
	const stopRequestedRef = useRef(false);
	const segmentStartedAtRef = useRef(0);
	const timerRef = useRef<number | null>(null);

	useEffect(() => {
		if (!capabilities.canMutateContent) return;
		void listLocalWorkspaceRecordings(workspaceId).then((recordings) => {
			setRecovery(recordings[0] ?? null);
		});
	}, [capabilities.canMutateContent, workspaceId]);

	useEffect(() => {
		if (phase !== "recording") return;
		const interval = window.setInterval(() => {
			const session = sessionRef.current;
			if (session)
				setElapsedMs(session.durationMs + (performance.now() - segmentStartedAtRef.current));
		}, 500);
		return () => window.clearInterval(interval);
	}, [phase]);

	const requestRecording = (nextParentId: string | null) => {
		setParentId(nextParentId);
		setName("Lecture recording");
		setPhase("setup");
		setOpen(true);
	};

	const startFreshRecording = async () => {
		const mimeType = getSupportedRecordingMimeType();
		if (!mimeType || !navigator.mediaDevices?.getUserMedia) {
			toast.error("This browser cannot record microphone audio.");
			return;
		}
		setPhase("finishing");
		let stream: MediaStream | null = null;
		try {
			stream = await navigator.mediaDevices.getUserMedia({ audio: true });
			const created = await createRecordingItem({ workspaceId, parentId, name, mimeType });
			applyWorkspacePageDeltaToCache(queryClient, {
				type: "workspace.items.upserted",
				workspaceId,
				revision: created.revision,
				items: [created.item],
			});
			const session: LocalWorkspaceRecording = {
				durationMs: 0,
				itemId: created.item.id,
				mimeType,
				name: created.item.name,
				parentId,
				segmentCount: 0,
				workspaceId,
			};
			await saveLocalWorkspaceRecording(session);
			await beginCapture(session, stream);
		} catch (error) {
			stream?.getTracks().forEach((track) => track.stop());
			setPhase("setup");
			toast.error(error instanceof Error ? error.message : "Unable to start recording.");
		}
	};

	const beginCapture = async (session: LocalWorkspaceRecording, existingStream?: MediaStream) => {
		const stream = existingStream ?? (await navigator.mediaDevices.getUserMedia({ audio: true }));
		sessionRef.current = session;
		streamRef.current = stream;
		stopRequestedRef.current = false;
		setElapsedMs(session.durationMs);
		setPhase("recording");
		startSegmentRecorder();
	};

	const startSegmentRecorder = () => {
		const session = sessionRef.current;
		const stream = streamRef.current;
		if (!session || !stream || stopRequestedRef.current) return;
		const recorder = new MediaRecorder(stream, {
			audioBitsPerSecond: 64_000,
			mimeType: session.mimeType,
		});
		const chunks: Blob[] = [];
		recorder.onstart = (event) => {
			segmentStartedAtRef.current = event.timeStamp;
		};
		recorder.ondataavailable = (event) => {
			if (event.data.size > 0) chunks.push(event.data);
		};
		recorder.onstop = (event) => {
			void persistCompletedSegment(chunks, event.timeStamp - segmentStartedAtRef.current);
		};
		recorderRef.current = recorder;
		recorder.start();
		timerRef.current = window.setTimeout(() => recorder.stop(), segmentDurationMs);
	};

	const persistCompletedSegment = async (chunks: Blob[], measuredDurationMs: number) => {
		const session = sessionRef.current;
		if (!session || chunks.length === 0) {
			if (!stopRequestedRef.current) startSegmentRecorder();
			return;
		}
		const durationMs = Math.max(1, Math.min(segmentDurationMs, measuredDurationMs));
		const nextSession: LocalWorkspaceRecording = {
			...session,
			durationMs: session.durationMs + durationMs,
			segmentCount: session.segmentCount + 1,
		};
		const segment = {
			blob: new Blob(chunks, { type: session.mimeType }),
			durationMs,
			itemId: session.itemId,
			mimeType: session.mimeType,
			sequence: session.segmentCount,
			workspaceId: session.workspaceId,
		};
		await saveLocalWorkspaceRecordingSegment(nextSession, segment);
		sessionRef.current = nextSession;
		setElapsedMs(nextSession.durationMs);
		void uploadStoredSegments(nextSession).catch(() => undefined);
		if (stopRequestedRef.current || nextSession.durationMs >= workspaceRecordingMaxDurationMs) {
			stopRequestedRef.current = true;
			await finishSession(nextSession);
		} else {
			startSegmentRecorder();
		}
	};

	const uploadStoredSegments = async (session: LocalWorkspaceRecording) => {
		const segments = await listLocalWorkspaceRecordingSegments(session.itemId);
		for (const segment of segments) {
			await uploadRecordingSegment(segment);
			await deleteLocalWorkspaceRecordingSegment(segment.itemId, segment.sequence);
		}
	};

	const finishSession = async (session: LocalWorkspaceRecording) => {
		setPhase("finishing");
		try {
			await uploadStoredSegments(session);
			await finalizeRecording(session);
			await deleteLocalWorkspaceRecording(session.itemId);
			setRecovery(null);
			setOpen(false);
			toast.success("Recording saved. Transcription is processing.");
		} catch (error) {
			setRecovery(session);
			toast.error(error instanceof Error ? error.message : "Recording is saved locally.");
			setOpen(false);
		} finally {
			streamRef.current?.getTracks().forEach((track) => track.stop());
			streamRef.current = null;
			recorderRef.current = null;
			sessionRef.current = null;
		}
	};

	const stopRecording = () => {
		stopRequestedRef.current = true;
		if (timerRef.current !== null) window.clearTimeout(timerRef.current);
		const recorder = recorderRef.current;
		if (recorder?.state === "recording") recorder.stop();
	};

	useEffect(() => {
		const stopForPageExit = () => {
			stopRequestedRef.current = true;
			if (timerRef.current !== null) window.clearTimeout(timerRef.current);
			if (recorderRef.current?.state === "recording") recorderRef.current.stop();
			streamRef.current?.getTracks().forEach((track) => track.stop());
		};
		window.addEventListener("pagehide", stopForPageExit);
		return () => {
			window.removeEventListener("pagehide", stopForPageExit);
			stopForPageExit();
		};
	}, []);

	const recoverRecording = async (mode: "resume" | "finish") => {
		if (!recovery) return;
		setRecovery(null);
		if (mode === "resume") {
			setOpen(true);
			setName(recovery.name);
			setParentId(recovery.parentId);
			try {
				await uploadStoredSegments(recovery);
				await beginCapture(recovery);
			} catch (error) {
				setOpen(false);
				setRecovery(recovery);
				toast.error(error instanceof Error ? error.message : "Unable to resume recording.");
			}
			return;
		}
		if (recovery.segmentCount < 1) {
			toast.error("No completed audio segment was recovered.");
			setRecovery(recovery);
			return;
		}
		await finishSession(recovery);
	};

	return (
		<WorkspaceRecordingContext.Provider value={{ requestRecording }}>
			{children}
			<Dialog open={open} onOpenChange={(nextOpen) => phase === "setup" && setOpen(nextOpen)}>
				<DialogContent showCloseButton={phase === "setup"}>
					<DialogHeader>
						<DialogTitle>
							{phase === "setup" ? "Record a lecture" : "Recording lecture"}
						</DialogTitle>
						<DialogDescription>
							{phase === "setup"
								? "Microphone audio is saved in short durable segments. You can close the lid and recover completed segments later."
								: phase === "recording"
									? `${formatRecordingTimestamp(elapsedMs)} · Microphone`
									: "Saving completed segments and starting transcription…"}
						</DialogDescription>
					</DialogHeader>
					{phase === "setup" ? (
						<Input
							value={name}
							maxLength={160}
							aria-label="Recording name"
							onChange={(event) => setName(event.target.value)}
						/>
					) : (
						<div className="flex items-center justify-center py-8">
							<div className="flex size-20 items-center justify-center rounded-full bg-rose-500/10 text-rose-600">
								<Mic className="size-8" />
							</div>
						</div>
					)}
					<DialogFooter>
						{phase === "setup" ? (
							<Button disabled={!name.trim()} onClick={() => void startFreshRecording()}>
								Start recording
							</Button>
						) : (
							<Button
								variant="destructive"
								disabled={phase === "finishing"}
								onClick={stopRecording}
							>
								<Square className="size-3 fill-current" /> Stop and transcribe
							</Button>
						)}
					</DialogFooter>
				</DialogContent>
			</Dialog>
			<Dialog open={Boolean(recovery)} onOpenChange={() => undefined}>
				<DialogContent showCloseButton={false}>
					<DialogHeader>
						<DialogTitle>Recover {recovery?.name}</DialogTitle>
						<DialogDescription>
							This recording was interrupted after{" "}
							{formatRecordingTimestamp(recovery?.durationMs ?? 0)}. Completed audio is still safe
							on this device.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button variant="outline" onClick={() => void recoverRecording("finish")}>
							Finish and transcribe
						</Button>
						<Button onClick={() => void recoverRecording("resume")}>Resume recording</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</WorkspaceRecordingContext.Provider>
	);
}

export function useWorkspaceRecording() {
	const context = use(WorkspaceRecordingContext);
	if (!context)
		throw new Error("useWorkspaceRecording must be used within WorkspaceRecordingProvider.");
	return context;
}
